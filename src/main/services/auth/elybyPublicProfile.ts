/**
 * Resolve https://ely.by/u{USER_ID} for an online player.
 *
 * USER_ID is the numeric Ely.by site account id (not the Minecraft UUID).
 * Sources:
 * - GET https://ely.by/search/?term={username} → exact nick match, href `/u{id}`
 * - profile HTML `al-init="wallId = {id}"` when href is a vanity path
 *
 * Nick/UUID existence is checked via the Mojang-compatible auth API
 * (https://docs.ely.by/ru/api.html). Without a numeric USER_ID, profileUrl is null.
 */

import {
  ELYBY_SEARCH_URL,
  ELYBY_USERNAME_PROFILE_URL,
  ELYBY_UUID_NAMES_URL,
  elybyNumericProfileUrl,
  elybyUsernameProfileUrl,
  parseElyAccountId,
  undashUuid
} from '../../../shared/elybyProfile'
import type { ElybyPublicProfile } from '../../../shared/types'

const USER_AGENT = 'AwesomeLauncher'
const FETCH_TIMEOUT_MS = 5000

interface SearchHit {
  nickname?: unknown
  href?: unknown
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function fetchText(
  url: string,
  accept: string
): Promise<{ ok: boolean; status: number; text: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept
      },
      signal: controller.signal,
      redirect: 'follow'
    })
    if (res.status === 204 || !res.ok) {
      return { ok: false, status: res.status, text: null }
    }
    return { ok: true, status: res.status, text: await res.text() }
  } catch {
    return { ok: false, status: 0, text: null }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  const result = await fetchText(url, 'application/json')
  if (!result.ok || result.text == null || result.status === 204) {
    return { ok: false, body: null }
  }
  try {
    return { ok: true, body: JSON.parse(result.text) }
  } catch {
    return { ok: false, body: null }
  }
}

function currentNameFromHistory(body: unknown): string | null {
  if (!Array.isArray(body) || body.length === 0) return null
  for (let i = body.length - 1; i >= 0; i -= 1) {
    const name = asString((body[i] as { name?: unknown })?.name)
    if (name) return name
  }
  return null
}

async function lookupUsernameByUuid(uuid: string): Promise<string | null> {
  const hex = undashUuid(uuid)
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  const result = await fetchJson(`${ELYBY_UUID_NAMES_URL}/${hex}/names`)
  if (!result.ok) return null
  return currentNameFromHistory(result.body)
}

async function verifyUsernameOnEly(username: string): Promise<string | null> {
  const name = username.trim()
  if (!name) return null
  const result = await fetchJson(`${ELYBY_USERNAME_PROFILE_URL}/${encodeURIComponent(name)}`)
  if (!result.ok || !result.body || typeof result.body !== 'object') return null
  return asString((result.body as { name?: unknown }).name) || name
}

/** Parse `/u123` or full `https://ely.by/u123` into numeric site id. */
export function parseElyUserIdFromHref(href: string): number | undefined {
  const trimmed = href.trim()
  const match = trimmed.match(/(?:^|\/)u(\d+)\/?$/i)
  if (!match) return undefined
  return parseElyAccountId(match[1])
}

/** Parse `al-init="wallId = 123"` from Ely profile HTML. */
export function parseElyUserIdFromProfileHtml(html: string): number | undefined {
  const match = html.match(/al-init\s*=\s*["']\s*wallId\s*=\s*(\d+)\s*["']/i)
  if (!match) return undefined
  return parseElyAccountId(match[1])
}

async function lookupElyUserIdByUsername(username: string): Promise<number | undefined> {
  const name = username.trim()
  if (!name) return undefined

  if (name.length >= 3) {
    const search = await fetchJson(`${ELYBY_SEARCH_URL}?term=${encodeURIComponent(name)}`)
    if (search.ok && Array.isArray(search.body)) {
      const exact = (search.body as SearchHit[]).find(
        (item) => asString(item.nickname)?.toLowerCase() === name.toLowerCase()
      )
      if (exact) {
        const href = asString(exact.href)
        if (href) {
          const fromHref = parseElyUserIdFromHref(href)
          if (fromHref) return fromHref

          const page = await fetchText(
            href.startsWith('http')
              ? href
              : `https://ely.by${href.startsWith('/') ? '' : '/'}${href}`,
            'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
          )
          if (page.ok && page.text) {
            const fromHtml = parseElyUserIdFromProfileHtml(page.text)
            if (fromHtml) return fromHtml
          }
        }
      }
    }
  }

  // Fallback: direct profile page (vanity or /Nick) may embed wallId.
  for (const candidate of [name, name.toLowerCase()]) {
    const page = await fetchText(
      elybyUsernameProfileUrl(candidate),
      'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
    )
    if (page.ok && page.text) {
      const fromHtml = parseElyUserIdFromProfileHtml(page.text)
      if (fromHtml) return fromHtml
    }
  }

  return undefined
}

export async function resolveElybyPublicProfile(input: {
  username?: string
  uuid?: string
}): Promise<ElybyPublicProfile> {
  const inputName = input.username?.trim() || ''
  const inputUuid = input.uuid?.trim() || ''
  const uuid = inputUuid ? undashUuid(inputUuid) : null

  let username: string | null = null
  if (inputUuid) {
    username = await lookupUsernameByUuid(inputUuid)
  }
  if (!username && inputName) {
    username = await verifyUsernameOnEly(inputName)
  }

  if (!username) {
    return {
      found: false,
      username: inputName || null,
      uuid,
      elyId: null,
      profileUrl: null
    }
  }

  const elyId = (await lookupElyUserIdByUsername(username)) ?? null
  return {
    found: true,
    username,
    uuid,
    elyId,
    profileUrl: elyId ? elybyNumericProfileUrl(elyId) : null
  }
}

import type { ElybyAccount } from './types'
import { ELYBY_AUTH_URL, ELYBY_SKIN_URL, ELYBY_TEXTURES_URL } from './types'

export const ELYBY_SITE_URL = 'https://ely.by'
export const ELYBY_ACCOUNT_DASHBOARD_URL = 'https://account.ely.by/'
/** Mojang-compatible username → UUID lookup (docs.ely.by/ru/api.html). */
export const ELYBY_USERNAME_PROFILE_URL = `${ELYBY_AUTH_URL}/api/users/profiles/minecraft`
/** Mojang-compatible UUID → name history lookup. */
export const ELYBY_UUID_NAMES_URL = `${ELYBY_AUTH_URL}/api/user/profiles`
/** Site user search (returns nickname + href like `/u3575339`). */
export const ELYBY_SEARCH_URL = `${ELYBY_SITE_URL}/search/`

/** Official skinsystem texture download URL (may 301 to ely.by/storage). */
export function elybySkinUrl(username: string, cacheBust = Date.now()): string {
  return `${ELYBY_SKIN_URL}/${encodeURIComponent(username)}.png?v=${encodeURIComponent(String(cacheBust))}`
}

/** Official textures metadata URL (`/textures/{nickname}`). */
export function elybyTexturesUrl(username: string): string {
  return `${ELYBY_TEXTURES_URL}/${encodeURIComponent(username)}`
}

/** Public site profile page by username (vanity or nick path). */
export function elybyUsernameProfileUrl(username: string): string {
  return `${ELYBY_SITE_URL}/${encodeURIComponent(username)}`
}

/** Public site profile page by numeric Ely.by account id. */
export function elybyNumericProfileUrl(elyId: number): string {
  return `${ELYBY_SITE_URL}/u${Math.trunc(elyId)}`
}

/** Undashed lowercase UUID for Ely/Mojang profile URLs. */
export function undashUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase()
}

/** Prefer https for Ely.by storage links returned as http in textures JSON. */
export function upgradeElybyAssetUrl(url: string): string {
  return url.replace(/^http:\/\/(ely\.by|skinsystem\.ely\.by)\//i, 'https://$1/')
}

/**
 * Public profile page. Prefer numeric site id (`/u3575339`); fall back to account dashboard.
 */
export function elybyProfileUrl(
  account: Pick<ElybyAccount, 'elyId' | 'username' | 'displayName'>
): string {
  const id = account.elyId
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
    return elybyNumericProfileUrl(id)
  }
  return ELYBY_ACCOUNT_DASHBOARD_URL
}

export function parseElyAccountId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return undefined
}

export function shortUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '')
  if (hex.length < 8) return uuid
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`
}

import crypto from 'crypto'
import got from 'got'
import { ELYBY_AUTH_URL } from '../../../shared/types'
import type { ElybyAccount } from '../../../shared/types'

export interface ElybyAuthResponse {
  accessToken: string
  clientToken: string
  availableProfiles?: Array<{ id: string; name: string }>
  selectedProfile?: { id: string; name: string }
  user?: { id: string; username?: string }
}

export interface ElybyApiResult {
  statusCode: number
  body: ElybyAuthResponse | { error?: string; errorMessage?: string } | null
  networkMessage?: string
}

export function normalizeProfileUuid(profileId: string | null | undefined): string {
  if (profileId == null || typeof profileId !== 'string') {
    return profileId as unknown as string
  }
  const hex = profileId.replace(/-/g, '').toLowerCase()
  if (hex.length !== 32) {
    return profileId.trim()
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function postJson(
  pathname: string,
  jsonBody: Record<string, unknown>
): Promise<ElybyApiResult> {
  try {
    const res = await got.post(`${ELYBY_AUTH_URL}${pathname}`, {
      json: jsonBody,
      responseType: 'json',
      throwHttpErrors: false,
      timeout: { request: 45000 },
      retry: { limit: 0 }
    })
    return { statusCode: res.statusCode, body: (res.body as ElybyAuthResponse) ?? null }
  } catch (err) {
    return {
      statusCode: 0,
      body: null,
      networkMessage: err instanceof Error ? err.message : String(err)
    }
  }
}

async function postMaybeEmpty(
  pathname: string,
  jsonBody: Record<string, unknown>
): Promise<ElybyApiResult> {
  try {
    const res = await got.post(`${ELYBY_AUTH_URL}${pathname}`, {
      json: jsonBody,
      responseType: 'text',
      throwHttpErrors: false,
      timeout: { request: 45000 },
      retry: { limit: 0 }
    })
    let body: ElybyAuthResponse | null = null
    const raw = (res.body || '').trim()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = null
      }
    }
    return { statusCode: res.statusCode, body }
  } catch (err) {
    return {
      statusCode: 0,
      body: null,
      networkMessage: err instanceof Error ? err.message : String(err)
    }
  }
}

export function authenticate(
  username: string,
  password: string,
  clientToken: string,
  totp?: string
): Promise<ElybyApiResult> {
  const finalPassword = totp ? `${password}:${totp}` : password
  return postJson('/auth/authenticate', {
    username,
    password: finalPassword,
    clientToken,
    requestUser: true
  })
}

export function refresh(accessToken: string, clientToken: string): Promise<ElybyApiResult> {
  return postJson('/auth/refresh', {
    accessToken,
    clientToken,
    requestUser: true
  })
}

export function validate(accessToken: string): Promise<ElybyApiResult> {
  return postMaybeEmpty('/auth/validate', { accessToken })
}

export function invalidate(accessToken: string, clientToken: string): Promise<ElybyApiResult> {
  return postMaybeEmpty('/auth/invalidate', { accessToken, clientToken })
}

export function createClientToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export function accountFromAuthResponse(body: ElybyAuthResponse): ElybyAccount {
  const profile = body.selectedProfile || body.availableProfiles?.[0]
  if (!profile) {
    throw new Error('Ely.by response did not include a profile')
  }
  return {
    type: 'elyby',
    accessToken: body.accessToken,
    username: body.user?.username || profile.name,
    uuid: normalizeProfileUuid(profile.id),
    displayName: profile.name
  }
}

import got from 'got'
import {
  ELYBY_ACCOUNT_INFO_URL,
  ELYBY_OAUTH_CLIENT_ID,
  ELYBY_OAUTH_DEVICE_URL,
  ELYBY_OAUTH_TOKEN_URL
} from '../../../shared/types'
import type { ElybyAccount } from '../../../shared/types'
import { normalizeProfileUuid } from './elybyAuth'
import { parseElyAccountId } from '../../../shared/elybyProfile'

export interface DeviceCodeStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'expired' }
  | { status: 'denied'; message: string }
  | { status: 'success'; account: ElybyAccount; refreshToken?: string }

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval?: number
}

interface TokenSuccess {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

interface TokenError {
  error: string
  error_description?: string
  message?: string
  interval?: number
}

interface AccountInfo {
  id: number
  uuid: string
  username: string
}

export async function startDeviceCodeLogin(
  clientId = ELYBY_OAUTH_CLIENT_ID
): Promise<DeviceCodeStart> {
  const body = await got
    .post(ELYBY_OAUTH_DEVICE_URL, {
      form: {
        client_id: clientId,
        scope: 'account_info offline_access minecraft_server_session'
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: { request: 30000 }
    })
    .json<DeviceCodeResponse & TokenError>()

  if (!body?.device_code || !body?.user_code) {
    throw new Error(
      body?.error_description || body?.message || body?.error || 'Device code request failed'
    )
  }

  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri || 'https://account.ely.by/code',
    expiresIn: body.expires_in || 600,
    interval: body.interval || 5
  }
}

export async function pollDeviceCodeLogin(
  deviceCode: string,
  clientId = ELYBY_OAUTH_CLIENT_ID
): Promise<DevicePollResult> {
  const res = await got.post(ELYBY_OAUTH_TOKEN_URL, {
    form: {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: clientId
    },
    responseType: 'json',
    throwHttpErrors: false,
    timeout: { request: 30000 }
  })

  const body = res.body as TokenSuccess & TokenError

  if (res.statusCode >= 200 && res.statusCode < 300 && body.access_token) {
    const account = await accountFromOAuthToken(body.access_token)
    return { status: 'success', account, refreshToken: body.refresh_token }
  }

  const error = body.error || 'unknown_error'
  if (error === 'authorization_pending') return { status: 'pending' }
  if (error === 'slow_down') {
    return { status: 'slow_down', interval: Number(body.interval) || 5 }
  }
  if (error === 'expired_token') return { status: 'expired' }
  if (error === 'access_denied') {
    return {
      status: 'denied',
      message: body.error_description || body.message || 'Authorization denied'
    }
  }

  return {
    status: 'denied',
    message: body.error_description || body.message || error
  }
}

async function accountFromOAuthToken(accessToken: string): Promise<ElybyAccount> {
  const info = await fetchElyAccountInfo(accessToken)

  if (!info?.uuid || !info?.username) {
    throw new Error('Ely.by account info response was incomplete')
  }

  return {
    type: 'elyby',
    accessToken,
    username: info.username,
    uuid: normalizeProfileUuid(info.uuid),
    displayName: info.username,
    elyId: parseElyAccountId(info.id)
  }
}

export async function fetchElyAccountInfo(accessToken: string): Promise<AccountInfo | null> {
  try {
    const info = await got
      .get(ELYBY_ACCOUNT_INFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'json',
        throwHttpErrors: false,
        timeout: { request: 30000 }
      })
      .json<AccountInfo>()
    if (!info?.uuid || !info?.username) return null
    return info
  } catch {
    return null
  }
}

/**
 * Fill missing `elyId` for accounts created before profile-id support, when the
 * access token still authorizes the account-info API (OAuth device-code tokens).
 */
export async function enrichAccountWithElyId(account: ElybyAccount): Promise<ElybyAccount> {
  if (account.elyId != null && account.elyId > 0) return account
  const info = await fetchElyAccountInfo(account.accessToken)
  const elyId = parseElyAccountId(info?.id)
  if (!elyId) return account
  return {
    ...account,
    elyId,
    username: info?.username || account.username,
    displayName: account.displayName || info?.username || account.username
  }
}

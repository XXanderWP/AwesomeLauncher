import type { ElybyAccount } from './types'
import { ELYBY_SKIN_URL } from './types'

export const ELYBY_SITE_URL = 'https://ely.by'
export const ELYBY_ACCOUNT_DASHBOARD_URL = 'https://account.ely.by/'

export function elybySkinUrl(username: string, cacheBust = Date.now()): string {
  return `${ELYBY_SKIN_URL}/${encodeURIComponent(username)}.png?v=${encodeURIComponent(String(cacheBust))}`
}

/**
 * Public profile page. Prefer numeric site id (`/u3575339`); fall back to account dashboard.
 */
export function elybyProfileUrl(
  account: Pick<ElybyAccount, 'elyId' | 'username' | 'displayName'>
): string {
  const id = account.elyId
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
    return `${ELYBY_SITE_URL}/u${Math.trunc(id)}`
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

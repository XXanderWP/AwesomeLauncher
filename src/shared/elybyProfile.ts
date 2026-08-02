import type { ElybyAccount } from './types'
import { ELYBY_SKIN_URL } from './types'

export const ELYBY_SITE_URL = 'https://ely.by'
export const ELYBY_ACCOUNT_DASHBOARD_URL = 'https://account.ely.by/'

export function elybySkinUrl(username: string, cacheBust = Date.now()): string {
  return `${ELYBY_SKIN_URL}/${encodeURIComponent(username)}.png?v=${encodeURIComponent(String(cacheBust))}`
}

export function elybyProfileUrl(account: Pick<ElybyAccount, 'username' | 'displayName'>): string {
  const name = (account.displayName || account.username || '').trim()
  return `${ELYBY_SITE_URL}/${encodeURIComponent(name)}`
}

export function shortUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '')
  if (hex.length < 8) return uuid
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`
}

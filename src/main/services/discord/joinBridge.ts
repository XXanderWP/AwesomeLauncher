import { PROTOCOL_JOIN_BRIDGE_BASE } from '../../../shared/protocol'

const CHECK_TTL_MS = 5 * 60 * 1000
const CHECK_TIMEOUT_MS = 5000

let cache: { ok: boolean; checkedAt: number } | null = null

/** Reset cached bridge probe (tests). */
export function resetJoinBridgeAvailabilityCache(): void {
  cache = null
}

/**
 * HEAD/GET probe for the Discord join HTTPS bridge.
 * Result is cached so Rich Presence refreshes do not hammer the CDN.
 */
export async function isJoinBridgeAvailable(
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<boolean> {
  if (cache && now - cache.checkedAt < CHECK_TTL_MS) {
    return cache.ok
  }

  const ok = await probeJoinBridge(PROTOCOL_JOIN_BRIDGE_BASE, fetchImpl)
  cache = { ok, checkedAt: now }
  if (!ok) {
    console.log(`[DiscordRPC] Join bridge unavailable: ${PROTOCOL_JOIN_BRIDGE_BASE}`)
  }
  return ok
}

async function probeJoinBridge(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    let response = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    })

    // Some static hosts reject HEAD — fall back to a lightweight GET.
    if (response.status === 405 || response.status === 501) {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { Range: 'bytes=0-0' }
      })
    }

    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

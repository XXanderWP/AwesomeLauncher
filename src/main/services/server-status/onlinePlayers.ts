import type { OnlinePlayersResult } from '../../../shared/types'

export const ONLINE_STATUS_PORT = 1313
const FETCH_TIMEOUT_MS = 5000

interface OnlineApiPlayer {
  uuid?: unknown
  name?: unknown
  playtime_ticks?: unknown
  playtime_seconds?: unknown
}

interface OnlineApiResponse {
  online?: unknown
  max?: unknown
  players?: unknown
  error?: unknown
  message?: unknown
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function formatPlaytime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${days}d ${hours}h ${minutes}m ${secs}s`
}

export async function fetchOnlinePlayers(
  host: string,
  statusPort = ONLINE_STATUS_PORT
): Promise<OnlinePlayersResult> {
  const url = `http://${host}:${statusPort}/online`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })

    let body: OnlineApiResponse | null = null
    try {
      body = (await response.json()) as OnlineApiResponse
    } catch {
      body = null
    }

    if (!response.ok) {
      const apiError = asString(body?.error)
      const apiMessage = asString(body?.message)
      return {
        ok: false,
        online: 0,
        max: 0,
        players: [],
        error:
          apiMessage ||
          apiError ||
          `HTTP ${response.status}`
      }
    }

    const playersRaw = Array.isArray(body?.players) ? (body.players as OnlineApiPlayer[]) : []
    const players = playersRaw
      .map((player) => {
        const playtimeSeconds = asNumber(player.playtime_seconds)
        return {
          uuid: asString(player.uuid),
          name: asString(player.name) || '?',
          playtimeTicks: asNumber(player.playtime_ticks),
          playtimeSeconds,
          playtimeFormatted: formatPlaytime(playtimeSeconds)
        }
      })
      .filter((player) => player.uuid)

    return {
      ok: true,
      online: asNumber(body?.online, players.length),
      max: asNumber(body?.max),
      players
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Request timed out'
          : err.message
        : String(err)
    return {
      ok: false,
      online: 0,
      max: 0,
      players: [],
      error: message
    }
  } finally {
    clearTimeout(timer)
  }
}

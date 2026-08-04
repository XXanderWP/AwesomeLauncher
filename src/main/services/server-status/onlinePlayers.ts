import type { OfflinePlayer, OnlinePlayer, OnlinePlayersResult } from '../../../shared/types'

export const ONLINE_STATUS_PORT = 1313
const FETCH_TIMEOUT_MS = 5000

interface OnlineApiPlayer {
  uuid?: unknown
  name?: unknown
  playtime_ticks?: unknown
  playtime_seconds?: unknown
  session_seconds?: unknown
  session_formatted?: unknown
}

interface OnlineApiResponse {
  online?: unknown
  max?: unknown
  offline?: unknown
  players?: unknown
  offline_players?: unknown
  error?: unknown
  message?: unknown
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : null
}

export function formatPlaytime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${days}d ${hours}h ${minutes}m ${secs}s`
}

function emptyFailure(error: string): OnlinePlayersResult {
  return {
    ok: false,
    online: 0,
    max: 0,
    offline: 0,
    players: [],
    offlinePlayers: [],
    supportsOfflineList: false,
    error
  }
}

function mapPlaytimePlayer(player: OnlineApiPlayer): Omit<OnlinePlayer, 'sessionSeconds' | 'sessionFormatted'> | null {
  const uuid = asString(player.uuid)
  if (!uuid) return null
  const playtimeSeconds = asNumber(player.playtime_seconds)
  return {
    uuid,
    name: asString(player.name) || '?',
    playtimeTicks: asNumber(player.playtime_ticks),
    playtimeSeconds,
    playtimeFormatted: formatPlaytime(playtimeSeconds)
  }
}

function mapOnlinePlayer(player: OnlineApiPlayer): OnlinePlayer | null {
  const base = mapPlaytimePlayer(player)
  if (!base) return null

  const hasSessionKey =
    Object.prototype.hasOwnProperty.call(player, 'session_seconds') ||
    Object.prototype.hasOwnProperty.call(player, 'session_formatted')

  if (!hasSessionKey) {
    return { ...base, sessionSeconds: null, sessionFormatted: null }
  }

  const sessionSeconds = asOptionalNumber(player.session_seconds)
  const sessionFormatted =
    asOptionalString(player.session_formatted) ??
    (sessionSeconds !== null ? formatPlaytime(sessionSeconds) : null)

  return { ...base, sessionSeconds, sessionFormatted }
}

function mapOfflinePlayer(player: OnlineApiPlayer): OfflinePlayer | null {
  return mapPlaytimePlayer(player)
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
      return emptyFailure(apiMessage || apiError || `HTTP ${response.status}`)
    }

    const playersRaw = Array.isArray(body?.players) ? (body.players as OnlineApiPlayer[]) : []
    const players = playersRaw
      .map((player) => mapOnlinePlayer(player))
      .filter((player): player is OnlinePlayer => player !== null)

    const supportsOfflineList =
      body != null &&
      (Object.prototype.hasOwnProperty.call(body, 'offline_players') ||
        Object.prototype.hasOwnProperty.call(body, 'offline'))

    const offlineRaw = Array.isArray(body?.offline_players)
      ? (body.offline_players as OnlineApiPlayer[])
      : []
    const offlinePlayers = supportsOfflineList
      ? offlineRaw
          .map((player) => mapOfflinePlayer(player))
          .filter((player): player is OfflinePlayer => player !== null)
      : []

    return {
      ok: true,
      online: asNumber(body?.online, players.length),
      max: asNumber(body?.max),
      offline: supportsOfflineList
        ? asNumber(body?.offline, offlinePlayers.length)
        : 0,
      players,
      offlinePlayers,
      supportsOfflineList
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Request timed out'
          : err.message
        : String(err)
    return emptyFailure(message)
  } finally {
    clearTimeout(timer)
  }
}

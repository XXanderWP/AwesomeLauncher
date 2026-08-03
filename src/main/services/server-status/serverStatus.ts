import { getServerStatus } from 'helios-core/mojang'
import type { ServerOnlineStatus } from '../../../shared/types'
import { extractMotdText } from '../../../shared/serverDisplayName'
import { fetchOnlinePlayers } from './onlinePlayers'

export async function fetchMinecraftPingStatus(
  host: string,
  port = 25565,
  protocol = 47
): Promise<ServerOnlineStatus> {
  const started = Date.now()
  try {
    const status = await getServerStatus(protocol, host, port)
    return {
      online: true,
      playersOnline: status.players?.online ?? 0,
      playersMax: status.players?.max ?? 0,
      versionName: status.version?.name ?? null,
      description: extractMotdText(status.description),
      latencyMs: Date.now() - started
    }
  } catch (err) {
    return {
      online: false,
      playersOnline: 0,
      playersMax: 0,
      versionName: null,
      description: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Server is online if the Minecraft status ping succeeds OR the /online
 * player-list endpoint responds successfully (false-offline mitigation).
 */
export async function fetchServerStatus(
  host: string,
  port = 25565,
  protocol = 47
): Promise<ServerOnlineStatus> {
  const [ping, players] = await Promise.all([
    fetchMinecraftPingStatus(host, port, protocol),
    fetchOnlinePlayers(host)
  ])

  if (ping.online || players.ok) {
    return {
      online: true,
      playersOnline: players.ok ? players.online : ping.playersOnline,
      playersMax: players.ok ? players.max : ping.playersMax,
      versionName: ping.versionName,
      description: ping.description,
      latencyMs: ping.latencyMs
    }
  }

  const errors = [ping.error, players.error].filter(Boolean)
  return {
    online: false,
    playersOnline: 0,
    playersMax: 0,
    versionName: null,
    description: null,
    latencyMs: null,
    error: errors.join('; ') || 'Server unreachable'
  }
}

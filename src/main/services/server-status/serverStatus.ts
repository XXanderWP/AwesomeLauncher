import { getServerStatus } from 'helios-core/mojang'
import type { ServerOnlineStatus } from '../../../shared/types'
import { extractMotdText } from '../../../shared/serverDisplayName'

export async function fetchServerStatus(
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

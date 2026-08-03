/** Custom URL scheme registered with the OS for deep links. */
export const PROTOCOL_SCHEME = 'awesomelauncher'

/**
 * HTTPS bridge for Discord Rich Presence buttons (Discord only allows http/https).
 * Host `resources/web/join.html` at this path on the CDN.
 */
export const PROTOCOL_JOIN_BRIDGE_BASE = 'https://files.awesome-craft.ru/launcher/join.html'

export function buildProtocolLaunchUrl(serverId: string): string {
  const id = encodeURIComponent(serverId)
  return `${PROTOCOL_SCHEME}://launch/${id}`
}

export function buildDiscordJoinButtonUrl(serverId: string): string {
  const url = new URL(PROTOCOL_JOIN_BRIDGE_BASE)
  url.searchParams.set('server', serverId)
  return url.toString()
}

export function findProtocolUrlInArgv(
  argv: string[],
  scheme: string = PROTOCOL_SCHEME
): string | null {
  const prefix = `${scheme}:`
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.toLowerCase().startsWith(prefix)) {
      return arg
    }
  }
  return null
}

export function parseLaunchProtocolUrl(
  raw: string,
  scheme: string = PROTOCOL_SCHEME
): { serverId: string } | null {
  if (!raw || typeof raw !== 'string') return null

  try {
    const parsed = new URL(raw)
    const proto = parsed.protocol.replace(/:$/, '').toLowerCase()
    if (proto !== scheme.toLowerCase()) return null

    const fromQuery = parsed.searchParams.get('server')?.trim()
    if (fromQuery) {
      return { serverId: fromQuery }
    }

    const host = parsed.hostname.toLowerCase()
    const pathParts = parsed.pathname
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        try {
          return decodeURIComponent(p)
        } catch {
          return p
        }
      })

    if (host === 'launch') {
      if (pathParts[0]) return { serverId: pathParts[0] }
      return null
    }

    if (pathParts[0]?.toLowerCase() === 'launch' && pathParts[1]) {
      return { serverId: pathParts[1] }
    }

    return null
  } catch {
    return null
  }
}

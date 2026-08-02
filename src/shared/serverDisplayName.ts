/**
 * Flatten Minecraft chat / MOTD components into plain text.
 */
export function extractMotdText(input: unknown): string | null {
  const raw = extractMotdRaw(input)
  if (raw == null) return null
  const trimmed = stripMotdFormatting(raw).trim()
  return trimmed || null
}

function extractMotdRaw(input: unknown): string | null {
  if (input == null) return null
  if (typeof input === 'string') {
    return input
  }
  if (typeof input !== 'object') return null

  const node = input as {
    text?: unknown
    translate?: unknown
    extra?: unknown
    with?: unknown
  }
  const parts: string[] = []

  if (typeof node.text === 'string') {
    parts.push(node.text)
  } else if (typeof node.translate === 'string') {
    parts.push(node.translate)
  }

  if (Array.isArray(node.with)) {
    for (const child of node.with) {
      const nested = extractMotdRaw(child)
      if (nested != null) parts.push(nested)
    }
  }

  if (Array.isArray(node.extra)) {
    for (const child of node.extra) {
      const nested = extractMotdRaw(child)
      if (nested != null) parts.push(nested)
    }
  }

  if (parts.length === 0) return null
  return parts.join('')
}

/** Remove classic § color/format codes from MOTD text. */
export function stripMotdFormatting(value: string): string {
  return value.replace(/§./g, '').replace(/\u00a7./g, '')
}

/**
 * Prefer live MOTD, then cached name, then distribution.json name.
 */
export function resolveServerDisplayName(
  distroName: string,
  liveName: string | null | undefined,
  cachedName: string | null | undefined
): string {
  const live = liveName?.trim()
  if (live) return live
  const cached = cachedName?.trim()
  if (cached) return cached
  return distroName
}

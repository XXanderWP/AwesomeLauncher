/**
 * Flatten Minecraft chat / MOTD components into plain text.
 */
export function extractMotdText(input: unknown): string | null {
  if (input == null) return null
  if (typeof input === 'string') {
    const trimmed = stripMotdFormatting(input).trim()
    return trimmed || null
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
      const nested = extractMotdText(child)
      if (nested) parts.push(nested)
    }
  }

  if (Array.isArray(node.extra)) {
    for (const child of node.extra) {
      const nested = extractMotdText(child)
      if (nested) parts.push(nested)
    }
  }

  const joined = stripMotdFormatting(parts.join('')).trim()
  return joined || null
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

import fs from 'fs-extra'
import path from 'path'

/**
 * Live Prominence Discord fields produced in-game by `prominent_talents` + SDRP.
 *
 * Format from `elocindev.prominent_talents.util.rpc.PromRPCState`:
 * - details: `📍 <biome>, <dimension>`
 * - state:   `Level <player> | <item> Item Level`
 */
export interface ProminencePresenceData {
  location: string | null
  levels: string | null
  playerLevel: number | null
  itemLevel: number | null
  updatedAt: number
}

const SENT_STATE_MARKER = 'Sent state to discord:'
const LEVELS_RE = /^Level\s+(\d+)\s*\|\s*(\d+)\s+Item Level$/i

export function parseLevelsState(state: string): {
  levels: string
  playerLevel: number
  itemLevel: number
} | null {
  const match = LEVELS_RE.exec(state.trim())
  if (!match) return null
  return {
    levels: `Level ${match[1]} | ${match[2]} Item Level`,
    playerLevel: Number(match[1]),
    itemLevel: Number(match[2])
  }
}

export function parseSdrpPresenceJson(rawJson: string): ProminencePresenceData | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const record = parsed as Record<string, unknown>
  const state = typeof record.state === 'string' ? record.state : null
  const details = typeof record.details === 'string' ? record.details : null
  if (!state && !details) return null

  const levels = state ? parseLevelsState(state) : null
  const location = details || null

  return {
    location,
    levels: levels?.levels ?? (state && !levels ? state : null),
    playerLevel: levels?.playerLevel ?? null,
    itemLevel: levels?.itemLevel ?? null,
    updatedAt: Date.now()
  }
}

/** Extract Prominence RPC payload from an SDRP log line (`logState: true`). */
export function parseSdrpPresenceLogLine(text: string): ProminencePresenceData | null {
  const idx = text.indexOf(SENT_STATE_MARKER)
  if (idx < 0) return null
  const after = text.slice(idx + SENT_STATE_MARKER.length).trim()
  const brace = after.indexOf('{')
  if (brace < 0) return null
  return parseSdrpPresenceJson(after.slice(brace))
}

export function extractLatestProminencePresence(
  logs: Array<{ text: string; timestamp?: number }>
): ProminencePresenceData | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const parsed = parseSdrpPresenceLogLine(logs[i].text)
    if (!parsed) continue
    if (typeof logs[i].timestamp === 'number') {
      parsed.updatedAt = logs[i].timestamp as number
    }
    return parsed
  }
  return null
}

/**
 * SDRP only logs the Rich Presence JSON when `logState` is true.
 * Safe for player configs: `config/` is preserved across sync.
 */
export async function ensureSdrpLogState(gameDir: string): Promise<boolean> {
  const configPath = path.join(gameDir, 'config', 'sdrp-common.json')
  if (!(await fs.pathExists(configPath))) return false

  let raw: Record<string, unknown>
  try {
    raw = (await fs.readJson(configPath)) as Record<string, unknown>
  } catch {
    return false
  }

  if (raw.logState === true) return false

  raw.logState = true
  await fs.writeJson(configPath, raw, { spaces: 2 })
  return true
}

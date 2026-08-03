import fs from 'fs-extra'
import path from 'path'

export interface XaeroWaypoint {
  name: string
  initials: string
  x: number
  y: number
  z: number
  colorIndex: number
  disabled: boolean
  /** 0 = normal, 1 = death (common Xaero convention) */
  type: number
  set: string
  kind: 'normal' | 'death'
}

export interface XaeroLogoutPosition {
  x: number
  y: number
  z: number
  source: 'death-waypoint'
  label: string
}

const WAYPOINT_COLORS = [
  '#5555FF',
  '#00AAAA',
  '#55FF55',
  '#FFFF55',
  '#FFAA00',
  '#FF5555',
  '#FF55FF',
  '#AAAAAA',
  '#555555',
  '#000000',
  '#0000AA',
  '#00AAAA',
  '#00AA00',
  '#AAAA00',
  '#FFAA00',
  '#AA0000'
]

export function waypointColor(index: number): string {
  const i = ((index % WAYPOINT_COLORS.length) + WAYPOINT_COLORS.length) % WAYPOINT_COLORS.length
  return WAYPOINT_COLORS[i]
}

/**
 * Parse Xaero minimap waypoint files:
 * xaero/minimap/Multiplayer_<host>/dim%<id>/mw$..._*.txt
 *
 * Format:
 * waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination
 */
export function parseWaypointFile(content: string): XaeroWaypoint[] {
  const out: XaeroWaypoint[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (!line.toLowerCase().startsWith('waypoint:')) continue
    const parts = line.split(':')
    // waypoint + at least name, initials, x, y, z, color, disabled, type
    if (parts.length < 9) continue
    const name = parts[1] ?? ''
    const initials = parts[2] ?? ''
    const x = Number.parseInt(parts[3] ?? '', 10)
    const y = Number.parseInt(parts[4] ?? '', 10)
    const z = Number.parseInt(parts[5] ?? '', 10)
    const colorIndex = Number.parseInt(parts[6] ?? '0', 10)
    const disabled = (parts[7] ?? '').toLowerCase() === 'true'
    const type = Number.parseInt(parts[8] ?? '0', 10)
    const set = parts[9] ?? 'gui.xaero_default'
    if (![x, y, z].every((n) => Number.isFinite(n))) continue
    const kind: 'normal' | 'death' =
      type === 1 || /death|смерть|☠/i.test(name) ? 'death' : 'normal'
    out.push({
      name: name.trim() || initials || 'Waypoint',
      initials: initials.trim() || name.trim().slice(0, 1) || '?',
      x,
      y,
      z,
      colorIndex: Number.isFinite(colorIndex) ? colorIndex : 0,
      disabled,
      type: Number.isFinite(type) ? type : 0,
      set,
      kind
    })
  }
  return out
}

export async function loadXaeroWaypoints(
  instanceDir: string,
  host: string
): Promise<XaeroWaypoint[]> {
  const root = path.join(instanceDir, 'xaero', 'minimap', `Multiplayer_${host.trim()}`)
  if (!(await fs.pathExists(root))) return []

  const waypoints: XaeroWaypoint[] = []
  const dimDirs = (await fs.readdir(root, { withFileTypes: true })).filter(
    (d) => d.isDirectory() && d.name.startsWith('dim%')
  )

  // Prefer overworld dim%0 / dim%minecraft$overworld when present; still load all
  for (const dim of dimDirs) {
    const dimPath = path.join(root, dim.name)
    const files = (await fs.readdir(dimPath)).filter((n) => n.endsWith('.txt'))
    for (const file of files) {
      // Prefer overworld files for the main map; still include nether/end
      // but mark only overworld for the surface map viewer
      const isOverworld =
        dim.name === 'dim%0' ||
        dim.name.toLowerCase().includes('overworld') ||
        dim.name === 'dim%minecraft$overworld'
      if (!isOverworld) continue
      const content = await fs.readFile(path.join(dimPath, file), 'utf8')
      waypoints.push(...parseWaypointFile(content))
    }
  }

  return waypoints.filter((w) => !w.disabled)
}

export function resolveLogoutPosition(waypoints: XaeroWaypoint[]): XaeroLogoutPosition | null {
  const deaths = waypoints.filter((w) => w.kind === 'death')
  if (deaths.length === 0) return null
  // Last death in file order is usually the newest
  const last = deaths[deaths.length - 1]
  return {
    x: last.x,
    y: last.y,
    z: last.z,
    source: 'death-waypoint',
    label: last.name
  }
}

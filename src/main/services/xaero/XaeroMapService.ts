import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import { instanceDirectory } from '../../utils/paths'
import {
  composeRegionRgba,
  composeWorldRgba,
  countOpaquePixels,
  encodePngRgba,
  extractXaeroCacheTiles,
  scaleRgbaNearest,
  XAERO_REGION_PX,
  type RegionPlacement
} from './xaeroCacheMap'
import {
  loadXaeroWaypoints,
  resolveLogoutPosition,
  waypointColor,
  type XaeroLogoutPosition,
  type XaeroWaypoint
} from './xaeroWaypoints'

const MAX_PNG_SIDE = 4096

export interface XaeroMapAvailability {
  available: boolean
  host: string
  mapDir: string | null
}

export interface XaeroMapWaypointDto {
  name: string
  initials: string
  x: number
  y: number
  z: number
  color: string
  kind: 'normal' | 'death'
}

export interface XaeroMapRenderResult {
  available: boolean
  host: string
  /** data:image/png;base64,... when available */
  dataUrl: string | null
  width: number
  height: number
  regionCount: number
  /** World block coordinate of map pixel (0,0) */
  originBlockX: number
  originBlockZ: number
  /** How many world blocks one map pixel represents */
  blocksPerPixel: number
  waypoints: XaeroMapWaypointDto[]
  logoutPosition: XaeroLogoutPosition | null
  error?: string
}

interface CacheCandidate {
  files: string[]
  level: number
  opaque: number
}

export class XaeroMapService {
  constructor(private readonly getDataDirectory: () => string) {}

  multiplayerMapRoot(serverId: string, host: string): string {
    const safeHost = host.trim()
    return path.join(
      instanceDirectory(this.getDataDirectory(), serverId),
      'xaero',
      'world-map',
      `Multiplayer_${safeHost}`
    )
  }

  async hasMap(serverId: string, host: string): Promise<XaeroMapAvailability> {
    const mapDir = this.multiplayerMapRoot(serverId, host)
    if (!host.trim() || !(await fs.pathExists(mapDir))) {
      return { available: false, host, mapDir: null }
    }
    const best = await this.pickBestCache(mapDir)
    return {
      available: Boolean(best && best.files.length > 0),
      host,
      mapDir: best && best.files.length > 0 ? mapDir : null
    }
  }

  async renderMap(serverId: string, host: string): Promise<XaeroMapRenderResult> {
    const empty: XaeroMapRenderResult = {
      available: false,
      host,
      dataUrl: null,
      width: 0,
      height: 0,
      regionCount: 0,
      originBlockX: 0,
      originBlockZ: 0,
      blocksPerPixel: 1,
      waypoints: [],
      logoutPosition: null
    }

    const availability = await this.hasMap(serverId, host)
    if (!availability.available || !availability.mapDir) return empty

    try {
      const best = await this.pickBestCache(availability.mapDir)
      if (!best || best.files.length === 0) {
        return { ...empty, error: 'No readable map tiles' }
      }

      const regions: RegionPlacement[] = []
      for (const file of best.files) {
        const parsed = parseRegionCoords(path.basename(file))
        if (!parsed) continue
        const data = readCacheXaero(file)
        if (!data) continue
        const tiles = extractXaeroCacheTiles(data)
        const rgba = composeRegionRgba(tiles)
        if (!rgba || countOpaquePixels(rgba) === 0) continue
        regions.push({ regionX: parsed.x, regionZ: parsed.z, rgba })
      }

      if (regions.length === 0) {
        return { ...empty, error: 'No readable map tiles' }
      }

      const world = composeWorldRgba(regions)
      if (!world) {
        return { ...empty, error: 'Failed to compose map' }
      }

      const levelScale = 2 ** best.level
      const originBlockX = world.originX * XAERO_REGION_PX * levelScale
      const originBlockZ = world.originZ * XAERO_REGION_PX * levelScale

      const scaled = scaleRgbaNearest(world.rgba, world.width, world.height, MAX_PNG_SIDE)
      const scaleFactor = world.width / scaled.width
      const blocksPerPixel = levelScale * scaleFactor

      for (let i = 0; i < scaled.rgba.length; i += 4) {
        if (scaled.rgba[i + 3] === 0) {
          scaled.rgba[i] = 18
          scaled.rgba[i + 1] = 18
          scaled.rgba[i + 2] = 22
          scaled.rgba[i + 3] = 255
        }
      }

      const instanceDir = instanceDirectory(this.getDataDirectory(), serverId)
      const waypointsRaw = await loadXaeroWaypoints(instanceDir, host)
      const waypoints: XaeroMapWaypointDto[] = waypointsRaw.map((w: XaeroWaypoint) => ({
        name: w.name,
        initials: w.initials,
        x: w.x,
        y: w.y,
        z: w.z,
        color: waypointColor(w.colorIndex),
        kind: w.kind
      }))
      const logoutPosition = resolveLogoutPosition(waypointsRaw)

      const png = encodePngRgba(scaled.rgba, scaled.width, scaled.height)
      return {
        available: true,
        host,
        dataUrl: `data:image/png;base64,${png.toString('base64')}`,
        width: scaled.width,
        height: scaled.height,
        regionCount: regions.length,
        originBlockX,
        originBlockZ,
        blocksPerPixel,
        waypoints,
        logoutPosition
      }
    } catch (err) {
      return {
        ...empty,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private async pickBestCache(mapRoot: string): Promise<CacheCandidate | null> {
    const mwDirs = await this.findMapWorldDirs(mapRoot)
    let best: CacheCandidate | null = null

    for (const mwDir of mwDirs) {
      for (const candidate of await this.collectCandidates(mwDir)) {
        if (!best) {
          best = candidate
          continue
        }
        // Prefer higher detail (lower zoom level). Only trade detail for much
        // more coverage so sparse leaf caches don't lose to dense branch ones.
        if (candidate.level < best.level) {
          if (candidate.opaque >= best.opaque * 0.15 || candidate.level === 0) {
            best = candidate
          }
        } else if (candidate.level === best.level && candidate.opaque > best.opaque) {
          best = candidate
        } else if (candidate.level > best.level && candidate.opaque > best.opaque * 4) {
          best = candidate
        }
      }
    }
    return best
  }

  /**
   * Xaero layout (from MapSaveLoad / BranchLeveledRegion):
   * - Leaf (1 block/px): `{mw}/cache_{version}/{rx}_{rz}.xwmc`
   * - Branch level N (2^N blocks/px): `{mw}/cache/{N}/{rx}_{rz}.xwmc`
   */
  private async collectCandidates(mwDir: string): Promise<CacheCandidate[]> {
    const out: CacheCandidate[] = []
    const entries = await fs.readdir(mwDir, { withFileTypes: true })

    // Leaf caches: cache_1, cache_2, … (version folders, always level 0)
    let bestLeafVersion = -1
    let bestLeaf: CacheCandidate | null = null
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const m = /^cache_(\d+)$/.exec(e.name)
      if (!m) continue
      const version = Number.parseInt(m[1], 10)
      const files = await listXwmc(path.join(mwDir, e.name))
      if (files.length === 0) continue
      if (version < bestLeafVersion) continue
      const opaque = await estimateOpaque(files)
      if (version > bestLeafVersion || !bestLeaf || opaque > bestLeaf.opaque) {
        bestLeafVersion = version
        bestLeaf = { files, level: 0, opaque }
      }
    }
    if (bestLeaf) out.push(bestLeaf)

    // Branch caches: cache/1, cache/2, …
    const branchRoot = path.join(mwDir, 'cache')
    if (await fs.pathExists(branchRoot)) {
      const levels = await fs.readdir(branchRoot, { withFileTypes: true })
      for (const e of levels) {
        if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue
        const level = Number.parseInt(e.name, 10)
        if (!Number.isFinite(level) || level < 1) continue
        const files = await listXwmc(path.join(branchRoot, e.name))
        if (files.length === 0) continue
        out.push({
          files,
          level,
          opaque: await estimateOpaque(files)
        })
      }
    }

    return out
  }

  private async findMapWorldDirs(mapRoot: string): Promise<string[]> {
    const result: string[] = []
    if (!(await fs.pathExists(mapRoot))) return result

    const dimEntries = await fs.readdir(mapRoot, { withFileTypes: true })
    for (const dim of dimEntries) {
      if (!dim.isDirectory()) continue
      const dimPath = path.join(mapRoot, dim.name)
      const children = await fs.readdir(dimPath, { withFileTypes: true })
      for (const child of children) {
        if (child.isDirectory() && child.name.startsWith('mw')) {
          result.push(path.join(dimPath, child.name))
        }
      }
    }
    return result
  }
}

/** Accept both live `.xwmc` and post-quit `.xwmc.outdated` region names. */
export function parseRegionCoords(name: string): { x: number; z: number } | null {
  const m = /^(-?\d+)_(-?\d+)\.xwmc(?:\.outdated)?$/i.exec(name)
  if (!m) return null
  return { x: Number.parseInt(m[1], 10), z: Number.parseInt(m[2], 10) }
}

/**
 * List region cache files. After the game exits Xaero often renames the current
 * region to `*.xwmc.outdated` before rewriting — prefer live `.xwmc`, else use
 * the outdated copy so explored terrain does not vanish from the launcher map.
 */
export async function listXwmc(dir: string): Promise<string[]> {
  if (!(await fs.pathExists(dir))) return []
  const entries = await fs.readdir(dir)
  const byRegion = new Map<string, { live?: string; outdated?: string }>()

  for (const name of entries) {
    const lower = name.toLowerCase()
    const live = /^(-?\d+)_(-?\d+)\.xwmc$/.exec(lower)
    const outdated = /^(-?\d+)_(-?\d+)\.xwmc\.outdated$/.exec(lower)
    const key = live ? `${live[1]}_${live[2]}` : outdated ? `${outdated[1]}_${outdated[2]}` : null
    if (!key) continue
    const slot = byRegion.get(key) || {}
    if (live) slot.live = path.join(dir, name)
    else slot.outdated = path.join(dir, name)
    byRegion.set(key, slot)
  }

  const files: string[] = []
  for (const slot of byRegion.values()) {
    if (slot.live) files.push(slot.live)
    else if (slot.outdated) files.push(slot.outdated)
  }
  return files
}

function readCacheXaero(xwmcPath: string): Buffer | null {
  try {
    const zip = new AdmZip(xwmcPath)
    const entry = zip.getEntry('cache.xaero')
    if (!entry) return null
    return entry.getData()
  } catch {
    return null
  }
}

/** Sample opaque pixel count across cache files (capped for speed). */
async function estimateOpaque(files: string[]): Promise<number> {
  let total = 0
  const sample = files.slice(0, 8)
  for (const file of sample) {
    const data = readCacheXaero(file)
    if (!data) continue
    const tiles = extractXaeroCacheTiles(data)
    for (const tile of tiles) total += countOpaquePixels(tile.rgba)
  }
  // Extrapolate if we only sampled
  if (files.length > sample.length && sample.length > 0) {
    total = Math.round((total / sample.length) * files.length)
  }
  return total
}

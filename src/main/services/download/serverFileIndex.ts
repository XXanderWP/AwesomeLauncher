import fs from 'fs-extra'
import path from 'path'

export const SYNC_INDEX_VERSION = 1

export interface ServerFileIndex {
  version: number
  serverId: string
  updatedAt: number
  /**
   * Paths relative to the launcher dataDirectory that were installed from
   * the distribution (common/… and instances/{id}/…).
   */
  trackedPaths: string[]
}

export function syncIndexPath(dataDirectory: string, serverId: string): string {
  return path.join(dataDirectory, 'sync-index', `${serverId}.json`)
}

export async function loadServerFileIndex(
  dataDirectory: string,
  serverId: string
): Promise<ServerFileIndex | null> {
  const file = syncIndexPath(dataDirectory, serverId)
  if (!(await fs.pathExists(file))) {
    return null
  }
  try {
    const raw = (await fs.readJson(file)) as ServerFileIndex
    if (!raw || !Array.isArray(raw.trackedPaths)) {
      return null
    }
    return {
      version: SYNC_INDEX_VERSION,
      serverId,
      updatedAt: raw.updatedAt || 0,
      trackedPaths: raw.trackedPaths.map((p) => p.replace(/\\/g, '/'))
    }
  } catch {
    return null
  }
}

export async function saveServerFileIndex(
  dataDirectory: string,
  serverId: string,
  trackedPaths: string[]
): Promise<ServerFileIndex> {
  const file = syncIndexPath(dataDirectory, serverId)
  await fs.ensureDir(path.dirname(file))
  const index: ServerFileIndex = {
    version: SYNC_INDEX_VERSION,
    serverId,
    updatedAt: Date.now(),
    trackedPaths: [...new Set(trackedPaths.map((p) => p.replace(/\\/g, '/')))].sort()
  }
  await fs.writeJson(file, index, { spaces: 2 })
  return index
}

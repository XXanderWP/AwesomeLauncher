import fs from 'fs-extra'
import path from 'path'
import {
  canDeleteOrphanTrackedPath,
  isFullyImmunePath,
  isUserModsPath,
  normalizeGameRelativePath,
  shouldProtectExistingFromOverwrite
} from '../../../shared/syncRules'
import { loadServerFileIndex, saveServerFileIndex } from './serverFileIndex'

export interface TrackedModule {
  /** Absolute path on disk (Helios module.getPath()). */
  absolutePath: string
  /** Path relative to dataDirectory, using `/` separators. */
  relativePath: string
  type: string
}

export interface SyncStats {
  protectedRestored: number
  orphansRemoved: number
  trackedCount: number
}

/**
 * Walk Helios server modules (and submodules) and collect disk paths.
 */
export function collectDistributionModules(server: any, dataDirectory: string): TrackedModule[] {
  const modules = server?.modules
  if (!Array.isArray(modules)) {
    return []
  }

  const out: TrackedModule[] = []
  const dataRoot = path.resolve(dataDirectory)

  const walk = (list: any[]): void => {
    for (const mod of list) {
      try {
        const absolutePath = typeof mod.getPath === 'function' ? mod.getPath() : null
        const type = mod.rawModule?.type || mod.type || 'Unknown'
        if (absolutePath && typeof absolutePath === 'string') {
          const relativePath = normalizeGameRelativePath(path.relative(dataRoot, absolutePath))
          if (relativePath && !relativePath.startsWith('..')) {
            out.push({ absolutePath, relativePath, type })
          }
        }
      } catch {
        // ignore broken module path resolution
      }
      const subs =
        mod.subModules ||
        (typeof mod.hasSubModules === 'function' && mod.hasSubModules() ? mod.subModules : null)
      if (Array.isArray(subs) && subs.length > 0) {
        walk(subs)
      }
    }
  }

  walk(modules)
  return out
}

/**
 * Instance-relative path for files under instances/{serverId}/, or null if not in instance.
 */
export function instanceRelativePath(dataRelativePath: string, serverId: string): string | null {
  const prefix = `instances/${serverId}/`
  const normalized = normalizeGameRelativePath(dataRelativePath)
  if (!normalized.startsWith(prefix)) {
    return null
  }
  return normalized.slice(prefix.length)
}

export function shouldSkipRemoteModule(dataRelativePath: string, serverId: string): boolean {
  const instRel = instanceRelativePath(dataRelativePath, serverId)
  if (!instRel) {
    return false
  }
  if (isFullyImmunePath(instRel) || isUserModsPath(instRel)) {
    return true
  }
  return false
}

/**
 * Delete local files that were previously synced from the server but are no longer
 * listed in the distribution. Never touches untracked local files, logs/, saves/, or mods/.
 */
export async function removeOrphanTrackedFiles(options: {
  dataDirectory: string
  serverId: string
  previousTrackedPaths: string[]
  currentTrackedPaths: Set<string>
}): Promise<number> {
  let removed = 0
  for (const rel of options.previousTrackedPaths) {
    const normalized = normalizeGameRelativePath(rel)
    if (options.currentTrackedPaths.has(normalized)) {
      continue
    }

    const instRel = instanceRelativePath(normalized, options.serverId)
    if (instRel && !canDeleteOrphanTrackedPath(instRel)) {
      continue
    }

    const abs = path.join(options.dataDirectory, ...normalized.split('/'))
    if (!(await fs.pathExists(abs))) {
      continue
    }
    try {
      await fs.remove(abs)
      removed++
    } catch {
      // ignore locked files
    }
  }
  return removed
}

/**
 * After FullRepair, restore protected instance files that existed before the repair,
 * remove orphans, and persist the new tracked file index.
 */
export async function finalizeFileSync(options: {
  dataDirectory: string
  serverId: string
  server: any
  protectedRestored: number
}): Promise<SyncStats> {
  const previous = await loadServerFileIndex(options.dataDirectory, options.serverId)
  const modules = collectDistributionModules(options.server, options.dataDirectory).filter(
    (m) => !shouldSkipRemoteModule(m.relativePath, options.serverId)
  )
  const currentPaths = modules.map((m) => m.relativePath)
  const currentSet = new Set(currentPaths)

  const orphansRemoved = await removeOrphanTrackedFiles({
    dataDirectory: options.dataDirectory,
    serverId: options.serverId,
    previousTrackedPaths: previous?.trackedPaths || [],
    currentTrackedPaths: currentSet
  })

  await saveServerFileIndex(options.dataDirectory, options.serverId, currentPaths)

  return {
    protectedRestored: options.protectedRestored,
    orphansRemoved,
    trackedCount: currentPaths.length
  }
}

export function isProtectedInstanceRelativePath(instanceRel: string): boolean {
  return shouldProtectExistingFromOverwrite(instanceRel)
}

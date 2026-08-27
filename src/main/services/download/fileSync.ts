import fs from 'fs-extra'
import path from 'path'
import { validateLocalFile } from 'helios-core/common'
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

function isPathBelow(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/**
 * Reuse exact, hash-matching files from the two layouts used by older
 * launchers. This runs before repair, preventing a full redownload and avoiding
 * duplicate loading from the now user-owned instance mods folder.
 */
export async function migrateLegacyPackMods(
  server: any,
  dataDirectory: string,
  serverId: string
): Promise<number> {
  const commonDir = path.join(dataDirectory, 'common')
  const instanceModsDir = path.join(dataDirectory, 'instances', serverId, 'mods')
  let migrated = 0

  const walk = async (modules: any[]): Promise<void> => {
    for (const module of modules) {
      const raw = module.rawModule || module
      const type = raw.type
      const hash = raw.artifact?.MD5
      let target: string | null = null
      try {
        target = typeof module.getPath === 'function' ? module.getPath() : null
      } catch {
        target = null
      }

      if (target && typeof hash === 'string') {
        let legacyPath: string | null = null
        if (type === 'NeoForgeMod' && typeof raw.artifact?.url === 'string') {
          try {
            const fileName = path.posix.basename(
              decodeURIComponent(new URL(raw.artifact.url).pathname)
            )
            const candidate = path.join(instanceModsDir, fileName)
            if (isPathBelow(instanceModsDir, candidate)) legacyPath = candidate
          } catch {
            // Invalid remote URL will be reported by FullRepair.
          }
        } else if (type === 'ForgeMod') {
          const forgeRoot = path.join(commonDir, 'mods', 'forge')
          if (isPathBelow(forgeRoot, target)) {
            legacyPath = path.join(commonDir, 'modstore', path.relative(forgeRoot, target))
          }
        }

        if (
          legacyPath &&
          (await fs.pathExists(legacyPath)) &&
          (await validateLocalFile(legacyPath, 'md5', hash))
        ) {
          await fs.ensureDir(path.dirname(target))
          if (!(await fs.pathExists(target))) {
            await fs.move(legacyPath, target)
          } else if (await validateLocalFile(target, 'md5', hash)) {
            await fs.remove(legacyPath)
          } else {
            await fs.remove(target)
            await fs.move(legacyPath, target)
          }
          migrated++
        }
      }

      if (Array.isArray(module.subModules) && module.subModules.length > 0) {
        await walk(module.subModules)
      }
    }
  }

  await walk(Array.isArray(server?.modules) ? server.modules : [])
  return migrated
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

/** Fail before FullRepair if a malformed/legacy distro tries to own user mods. */
export function assertDistributionDoesNotOwnUserMods(
  server: any,
  dataDirectory: string,
  serverId: string
): void {
  const offending = collectDistributionModules(server, dataDirectory)
    .map((module) => instanceRelativePath(module.relativePath, serverId))
    .find((relativePath) => relativePath != null && isUserModsPath(relativePath))
  if (offending) {
    throw new Error(
      `Distribution module resolves into user-owned instance/${offending}; regenerate and deploy the distro with NeoForgeMod modules`
    )
  }
}

export function shouldSkipRemoteModule(dataRelativePath: string, serverId: string): boolean {
  const instRel = instanceRelativePath(dataRelativePath, serverId)
  if (!instRel) {
    return false
  }
  if (isFullyImmunePath(instRel)) {
    return true
  }
  if (isUserModsPath(instRel)) {
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
  globallyReferencedPaths?: ReadonlySet<string>
  allowManagedMods?: boolean
}): Promise<number> {
  let removed = 0
  for (const rel of options.previousTrackedPaths) {
    const normalized = normalizeGameRelativePath(rel)
    if (options.currentTrackedPaths.has(normalized)) {
      continue
    }
    if (options.globallyReferencedPaths?.has(normalized)) {
      continue
    }

    const instRel = instanceRelativePath(normalized, options.serverId)
    if (
      instRel &&
      !canDeleteOrphanTrackedPath(instRel) &&
      !(options.allowManagedMods && isUserModsPath(instRel))
    ) {
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
  distribution?: any
  protectedRestored: number
}): Promise<SyncStats> {
  const previous = await loadServerFileIndex(options.dataDirectory, options.serverId)
  const modules = collectDistributionModules(options.server, options.dataDirectory).filter(
    (m) => !shouldSkipRemoteModule(m.relativePath, options.serverId)
  )
  const currentPaths = modules.map((m) => m.relativePath)
  const currentSet = new Set(currentPaths)
  const globallyReferencedPaths = new Set<string>()
  const allServers = options.distribution?.servers
  if (Array.isArray(allServers)) {
    for (const distroServer of allServers) {
      for (const module of collectDistributionModules(distroServer, options.dataDirectory)) {
        if (!shouldSkipRemoteModule(module.relativePath, distroServer.rawServer?.id || '')) {
          globallyReferencedPaths.add(module.relativePath)
        }
      }
    }
  }

  const orphansRemoved = await removeOrphanTrackedFiles({
    dataDirectory: options.dataDirectory,
    serverId: options.serverId,
    previousTrackedPaths: previous?.trackedPaths || [],
    currentTrackedPaths: currentSet,
    globallyReferencedPaths,
    allowManagedMods: true
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

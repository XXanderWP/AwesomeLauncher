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

const PACK_MOD_TYPES = new Set(['FabricMod', 'ForgeMod', 'NeoForgeMod', 'LiteMod'])

function isPathBelow(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function isSamePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right)
}

function fileNameFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const fileName = path.posix.basename(decodeURIComponent(new URL(url).pathname))
    if (!fileName || fileName === '.' || fileName === '..') return null
    if (fileName.includes('/') || fileName.includes('\\')) return null
    return fileName
  } catch {
    return null
  }
}

function instanceModsFile(instanceModsDir: string, fileName: string | null): string | null {
  if (!fileName) return null
  if (fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..') {
    return null
  }
  const candidate = path.join(instanceModsDir, fileName)
  return isPathBelow(instanceModsDir, candidate) ? candidate : null
}

async function relocateHashMatchingFile(
  legacyPath: string,
  target: string,
  hash: string
): Promise<boolean> {
  if (isSamePath(legacyPath, target)) return false
  if (!(await fs.pathExists(legacyPath))) return false
  if (!(await validateLocalFile(legacyPath, 'md5', hash))) return false
  await fs.ensureDir(path.dirname(target))
  if (!(await fs.pathExists(target))) {
    await fs.move(legacyPath, target)
  } else if (await validateLocalFile(target, 'md5', hash)) {
    await fs.remove(legacyPath)
  } else {
    await fs.remove(target)
    await fs.move(legacyPath, target)
  }
  return true
}

/**
 * Reuse exact, hash-matching files from the two layouts used by older
 * launchers. This runs before repair, preventing a full redownload and avoiding
 * duplicate loading from the now user-owned instance mods folder.
 *
 * Modules whose current target is still under instance/mods (an un-regenerated
 * distro) are left in place — those paths are skipped by FullRepair instead.
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

      if (
        target &&
        typeof hash === 'string' &&
        !isPathBelow(instanceModsDir, target) &&
        !isSamePath(target, instanceModsDir)
      ) {
        const candidates: string[] = []
        const seen = new Set<string>()
        const addCandidate = (candidate: string | null): void => {
          if (!candidate) return
          const resolved = path.resolve(candidate)
          if (seen.has(resolved)) return
          seen.add(resolved)
          candidates.push(candidate)
        }

        if (typeof type === 'string' && PACK_MOD_TYPES.has(type)) {
          addCandidate(instanceModsFile(instanceModsDir, fileNameFromUrl(raw.artifact?.url)))
          addCandidate(instanceModsFile(instanceModsDir, path.basename(target)))
        }
        if (type === 'ForgeMod') {
          const forgeRoot = path.join(commonDir, 'mods', 'forge')
          if (isPathBelow(forgeRoot, target)) {
            addCandidate(path.join(commonDir, 'modstore', path.relative(forgeRoot, target)))
          }
        }

        for (const legacyPath of candidates) {
          if (await relocateHashMatchingFile(legacyPath, target, hash)) {
            migrated++
            break
          }
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

function heliosModuleUserModsRelativePath(
  module: any,
  dataDirectory: string,
  serverId: string
): string | null {
  if (!module) return null
  try {
    const absolutePath = typeof module.getPath === 'function' ? module.getPath() : null
    if (!absolutePath || typeof absolutePath !== 'string') return null
    const relativePath = normalizeGameRelativePath(
      path.relative(path.resolve(dataDirectory), path.resolve(absolutePath))
    )
    if (!relativePath || relativePath.startsWith('..')) return null
    const instRel = instanceRelativePath(relativePath, serverId)
    return instRel && isUserModsPath(instRel) ? instRel : null
  } catch {
    return null
  }
}

function rawArtifactUserModsRelativePath(raw: any): string | null {
  const artifactPath = raw?.artifact?.path
  if (typeof artifactPath !== 'string') return null
  const normalized = normalizeGameRelativePath(artifactPath)
  return isUserModsPath(normalized) ? normalized : null
}

/**
 * Instance-relative user-mods paths still owned by a legacy/malformed distro.
 * Install must not abort on these — FullRepair skips them instead.
 */
export function findDistributionUserModsPaths(
  server: any,
  dataDirectory: string,
  serverId: string
): string[] {
  return collectDistributionModules(server, dataDirectory)
    .map((module) => instanceRelativePath(module.relativePath, serverId))
    .filter(
      (relativePath): relativePath is string => relativePath != null && isUserModsPath(relativePath)
    )
}

function omitUserModsOwnedModules(
  rawModules: any[] | undefined,
  heliosModules: any[] | undefined,
  dataDirectory: string,
  serverId: string
): { modules: any[]; omittedPaths: string[] } {
  const rawList = Array.isArray(rawModules) ? rawModules : []
  const heliosList = Array.isArray(heliosModules) ? heliosModules : []
  const omittedPaths: string[] = []
  const modules: any[] = []
  const count = Math.max(rawList.length, heliosList.length)

  for (let i = 0; i < count; i++) {
    const raw = rawList[i]
    const helios = heliosList[i]
    const nested = omitUserModsOwnedModules(
      raw?.subModules ?? helios?.subModules,
      helios?.subModules,
      dataDirectory,
      serverId
    )
    omittedPaths.push(...nested.omittedPaths)

    const ownedRel =
      heliosModuleUserModsRelativePath(helios, dataDirectory, serverId) ??
      rawArtifactUserModsRelativePath(raw)
    if (ownedRel) {
      omittedPaths.push(ownedRel)
      modules.push(...nested.modules)
      continue
    }

    if (!raw) {
      modules.push(...nested.modules)
      continue
    }

    if (Array.isArray(raw.subModules) || nested.modules.length > 0) {
      modules.push({ ...raw, subModules: nested.modules })
    } else {
      modules.push(raw)
    }
  }

  return { modules, omittedPaths }
}

/**
 * Drop modules whose Helios path (or File artifact.path) resolves under
 * instance/mods so FullRepair's child process never downloads or overwrites
 * player mods. Submodules that are not user-mods are promoted.
 */
export function omitUserModsFromRawDistribution(
  rawDistribution: any,
  heliosDistribution: any,
  dataDirectory: string,
  serverId: string
): { distribution: any; omittedPaths: string[] } {
  const rawServers: any[] = Array.isArray(rawDistribution?.servers) ? rawDistribution.servers : []
  const omittedPaths: string[] = []
  const heliosServers: any[] = Array.isArray(heliosDistribution?.servers)
    ? heliosDistribution.servers
    : []
  const servers = rawServers.map((rawServer: any) => {
    const id = rawServer?.id
    if (id !== serverId) return rawServer
    const heliosServer =
      heliosDistribution?.getServerById?.(serverId) ||
      heliosServers.find((s: any) => (s.rawServer?.id || s.id) === serverId) ||
      null
    const result = omitUserModsOwnedModules(
      rawServer.modules,
      heliosServer?.modules,
      dataDirectory,
      serverId
    )
    omittedPaths.push(...result.omittedPaths)
    return { ...rawServer, modules: result.modules }
  })
  return {
    distribution: { ...rawDistribution, servers },
    omittedPaths: [...new Set(omittedPaths)]
  }
}

/**
 * Rewrite the on-disk distro cache so FullRepair (which reloads it in a child
 * process) does not own instance/mods paths, then restore the original bytes.
 */
export async function runWithUserModsOmittedFromDistroCache<T>(options: {
  distroFile: string
  heliosDistribution: any
  dataDirectory: string
  serverId: string
  action: () => Promise<T>
}): Promise<{ result: T; omittedPaths: string[] }> {
  if (!(await fs.pathExists(options.distroFile))) {
    return { result: await options.action(), omittedPaths: [] }
  }

  const backup = await fs.readFile(options.distroFile)
  let raw: any
  try {
    raw = JSON.parse(backup.toString('utf8'))
  } catch {
    return { result: await options.action(), omittedPaths: [] }
  }

  const { distribution, omittedPaths } = omitUserModsFromRawDistribution(
    raw,
    options.heliosDistribution,
    options.dataDirectory,
    options.serverId
  )
  if (omittedPaths.length === 0) {
    return { result: await options.action(), omittedPaths }
  }

  try {
    await fs.writeJson(options.distroFile, distribution)
    return { result: await options.action(), omittedPaths }
  } finally {
    await fs.writeFile(options.distroFile, backup)
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
 * listed in the distribution. Never touches untracked local files, logs/, saves/,
 * or instance mods/ — leftover pack JARs under instance/mods are moved by
 * migrateLegacyPackMods (hash match), not deleted here.
 */
export async function removeOrphanTrackedFiles(options: {
  dataDirectory: string
  serverId: string
  previousTrackedPaths: string[]
  currentTrackedPaths: Set<string>
  globallyReferencedPaths?: ReadonlySet<string>
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
    globallyReferencedPaths
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

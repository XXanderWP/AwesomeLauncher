/**
 * Rules for synchronizing distribution files with the local instance/common trees.
 *
 * - Missing tracked remote files are always downloaded (Helios FullRepair).
 * - Files that existed on the server before but were removed are deleted locally
 *   (only if they were previously tracked as server-managed).
 * - logs/ and saves/ are fully immune.
 * - instance mods/ is user mods — never touched.
 * - config/ is kept if already present (no overwrite on remote hash change).
 * - options.txt / optionsshaders.txt are never overwritten when present.
 */

export function normalizeGameRelativePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Folders under the instance that sync must never read or write. */
export const FULLY_IMMUNE_DIRS = ['logs', 'saves'] as const

/** Instance folder for player-added mods (not pack FabricMods in common/). */
export const USER_MODS_DIR = 'mods'

const NEVER_OVERWRITE_FILES = new Set(['options.txt', 'optionsshaders.txt', 'optionshaders.txt'])

export function isUnderDirectory(relativePath: string, dirName: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  return path === dirName || path.startsWith(`${dirName}/`)
}

export function isFullyImmunePath(relativePath: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  return FULLY_IMMUNE_DIRS.some((dir) => path === dir || path.startsWith(`${dir}/`))
}

export function isUserModsPath(relativePath: string): boolean {
  return isUnderDirectory(relativePath, USER_MODS_DIR)
}

export function isConfigPath(relativePath: string): boolean {
  return isUnderDirectory(relativePath, 'config')
}

export function isNeverOverwriteFile(relativePath: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  return NEVER_OVERWRITE_FILES.has(path)
}

/**
 * Existing local files that FullRepair must not permanently overwrite.
 * (We backup before repair and restore after.)
 */
export function shouldProtectExistingFromOverwrite(relativePath: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  if (!path) return false
  if (isFullyImmunePath(path) || isUserModsPath(path)) return true
  if (isNeverOverwriteFile(path)) return true
  if (isConfigPath(path)) return true
  return false
}

/**
 * Paths that may be deleted when they leave the remote distribution,
 * but only if they were previously tracked as server-managed.
 */
export function canDeleteOrphanTrackedPath(relativePath: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  if (!path) return false
  if (isFullyImmunePath(path) || isUserModsPath(path)) return false
  return true
}

/** @deprecated Use shouldProtectExistingFromOverwrite — kept for older call sites/tests during transition. */
export function isPlayerMutablePath(relativePath: string): boolean {
  return shouldProtectExistingFromOverwrite(relativePath)
}

/** @deprecated Prefer syncRules helpers. */
export function shouldPreserveExistingFile(
  relativePath: string,
  fileExists: boolean,
  preserveEnabled: boolean
): boolean {
  if (!preserveEnabled || !fileExists) {
    return false
  }
  return shouldProtectExistingFromOverwrite(relativePath)
}

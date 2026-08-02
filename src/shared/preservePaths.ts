/**
 * Paths that belong to the player and must not be overwritten after first install.
 * Integrity checks still validate mods/libraries/assets; these files are skipped
 * when they already exist locally.
 */
const EXACT_PRESERVE = new Set([
  'options.txt',
  'optionsof.txt',
  'optionsshaders.txt',
  'servers.dat',
  'servers.dat_old',
  'usernamecache.json',
  'usercache.json',
  'xaerominimap.txt',
  'xaeroworldmap.txt',
  'hots.keybinds'
])

const PREFIX_PRESERVE = [
  'config/',
  'XaeroWaypoints/',
  'XaeroWorldMap/',
  'XaeroImages/',
  'journeymap/',
  'local/',
  'shaderpacks/', // user may toggle packs; defaults still install if missing
  'screenshots/',
  'saves/',
  'logs/',
  'crash-reports/'
]

/** Always overwrite / verify these even under config/ */
const FORCE_VERIFY_PREFIXES = ['config/yosbr/']

export function normalizeGameRelativePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isPlayerMutablePath(relativePath: string): boolean {
  const path = normalizeGameRelativePath(relativePath)
  if (!path) return false

  for (const force of FORCE_VERIFY_PREFIXES) {
    if (path.startsWith(force) || path === force.slice(0, -1)) {
      return false
    }
  }

  if (EXACT_PRESERVE.has(path)) {
    return true
  }

  return PREFIX_PRESERVE.some((prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1))
}

export function shouldPreserveExistingFile(
  relativePath: string,
  fileExists: boolean,
  preserveEnabled: boolean
): boolean {
  if (!preserveEnabled || !fileExists) {
    return false
  }
  return isPlayerMutablePath(relativePath)
}

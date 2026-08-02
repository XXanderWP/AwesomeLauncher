/**
 * Environment for the Minecraft JVM + host launcher sanitizers.
 *
 * Helios inherits the parent env. We do the same for Wayland/DISPLAY, but the
 * Minecraft JVM must NEVER see AppImage/Electron LD_LIBRARY_PATH — including
 * this launcher's own /tmp/.mount_* (that breaks NVIDIA GLX / GLFW).
 */

function isMountPath(entry) {
  return Boolean(entry && (entry.includes('/.mount_') || entry.includes('/tmp/.mount_')))
}

function isForeignBundledLibPath(entry, appDir) {
  if (!entry) return false
  if (appDir && (entry === appDir || entry.startsWith(appDir + '/'))) {
    return false
  }
  return (
    isMountPath(entry) ||
    entry.includes('/app/lib') ||
    entry.includes('/usr/lib/pressurized') ||
    entry.includes('/opt/Cursor') ||
    entry.includes('/opt/cursor')
  )
}

function isBundledLibPath(entry) {
  return isForeignBundledLibPath(entry, null)
}

function sanitizePath(value, appDir) {
  if (value == null || value === '') return '/usr/bin:/bin'
  const kept = String(value)
    .split(':')
    .map((p) => p.trim())
    .filter((p) => p && !isForeignBundledLibPath(p, appDir))
  for (const p of ['/usr/local/bin', '/usr/bin', '/bin']) {
    if (!kept.includes(p)) kept.push(p)
  }
  return kept.join(':')
}

function sanitizeLdLibraryPath(value, appDir) {
  if (value == null || value === '') return undefined
  const kept = String(value)
    .split(':')
    .map((p) => p.trim())
    .filter((p) => p && !isForeignBundledLibPath(p, appDir))
  return kept.length > 0 ? kept.join(':') : undefined
}

/**
 * Mutate Electron host process.env: drop Cursor/foreign AppImage library paths.
 * Keeps this app's own APPDIR mount so packaged Electron helpers keep working.
 */
function sanitizeLauncherProcessEnv(env = process.env, platform = process.platform) {
  if (platform !== 'linux') {
    return { changed: false, ldLibraryPath: env.LD_LIBRARY_PATH || null }
  }

  const appDir = env.APPDIR || null
  const before = env.LD_LIBRARY_PATH || ''
  const cleanedLd = sanitizeLdLibraryPath(before, appDir)
  if (cleanedLd == null) {
    delete env.LD_LIBRARY_PATH
  } else {
    env.LD_LIBRARY_PATH = cleanedLd
  }

  env.PATH = sanitizePath(env.PATH, appDir)

  if (env.LD_PRELOAD && isForeignBundledLibPath(env.LD_PRELOAD, appDir)) {
    delete env.LD_PRELOAD
  }

  return {
    changed: before !== (env.LD_LIBRARY_PATH || ''),
    ldLibraryPath: env.LD_LIBRARY_PATH || null,
    appDir
  }
}

/**
 * Env for the Minecraft child: inherit session (Wayland/DISPLAY/…), but never
 * pass AppImage library search paths into the JVM.
 */
function buildMinecraftProcessEnv(baseEnv = process.env, platform = process.platform) {
  const env = { ...baseEnv }

  if (platform === 'linux') {
    env.__GL_THREADED_OPTIMIZATIONS = '0'

    // Critical: strip ALL AppImage mounts for the game, including our APPDIR.
    // Electron needs those libs; Minecraft/NVIDIA must use the system GL stack.
    delete env.LD_LIBRARY_PATH
    delete env.LD_PRELOAD
    env.PATH = sanitizePath(env.PATH, null)

    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ASAR
    delete env.ELECTRON_NO_ATTACH_CONSOLE
  }

  return env
}

module.exports = {
  buildMinecraftProcessEnv,
  sanitizeLauncherProcessEnv,
  sanitizeLdLibraryPath,
  sanitizePath,
  isBundledLibPath
}

/**
 * Environment for the Minecraft JVM process + host launcher sanitizers.
 *
 * Cursor / foreign AppImages inject LD_LIBRARY_PATH with /tmp/.mount_* libs.
 * NVIDIA GLX + GLFW then SIGSEGV in glfwWaitEventsTimeout. Minecraft gets a
 * whitelisted env; the Electron host also strips foreign mounts from process.env
 * so nothing re-inherits them.
 */

const LINUX_PASSTHROUGH = [
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LC_NUMERIC',
  'LC_TIME',
  'LC_COLLATE',
  'LC_MONETARY',
  'TZ',
  'DISPLAY',
  'XAUTHORITY',
  'XDG_RUNTIME_DIR',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'DBUS_SESSION_BUS_ADDRESS',
  'SSH_AUTH_SOCK',
  'XCURSOR_SIZE',
  'XCURSOR_THEME',
  'GTK_THEME',
  'QT_QPA_PLATFORMTHEME',
  'JAVA_HOME',
  'HOSTNAME',
  'PWD'
]

function isMountPath(entry) {
  return Boolean(entry && (entry.includes('/.mount_') || entry.includes('/tmp/.mount_')))
}

function isForeignBundledLibPath(entry, appDir) {
  if (!entry) return false
  if (appDir && (entry === appDir || entry.startsWith(appDir + '/'))) {
    return false // keep our own AppImage libs for Electron helpers
  }
  return (
    isMountPath(entry) ||
    entry.includes('/app/lib') ||
    entry.includes('/usr/lib/pressurized') ||
    entry.includes('/opt/Cursor') ||
    entry.includes('/opt/cursor')
  )
}

/** @deprecated use isForeignBundledLibPath — kept for tests that filter any mount */
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
 * Mutate the Electron host process.env: drop Cursor/foreign AppImage library
 * paths. Keeps this app's own APPDIR mount so packaged builds keep working.
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

function buildLinuxMinecraftEnv(baseEnv) {
  const env = {}

  for (const key of LINUX_PASSTHROUGH) {
    if (baseEnv[key] != null && baseEnv[key] !== '') {
      env[key] = baseEnv[key]
    }
  }

  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith('LC_') && value != null && value !== '' && env[key] == null) {
      env[key] = value
    }
  }

  // Never pass host/AppImage library search paths into Minecraft.
  env.PATH = sanitizePath(baseEnv.PATH, null)
  // Explicitly omit LD_LIBRARY_PATH / LD_PRELOAD / APPDIR / ELECTRON_*.

  env.__GL_THREADED_OPTIMIZATIONS = '0'
  env.mesa_glthread = 'false'

  if (baseEnv.DISPLAY) {
    env.DISPLAY = baseEnv.DISPLAY
  }
  env.XDG_SESSION_TYPE = 'x11'
  env.GDK_BACKEND = 'x11'
  env.GLFW_PLATFORM = 'x11'
  env.QT_QPA_PLATFORM = 'xcb'

  return env
}

function buildMinecraftProcessEnv(baseEnv = process.env, platform = process.platform) {
  if (platform === 'linux') {
    return buildLinuxMinecraftEnv(baseEnv)
  }
  return { ...baseEnv }
}

module.exports = {
  buildMinecraftProcessEnv,
  sanitizeLauncherProcessEnv,
  sanitizeLdLibraryPath,
  sanitizePath,
  isBundledLibPath,
  LINUX_PASSTHROUGH
}

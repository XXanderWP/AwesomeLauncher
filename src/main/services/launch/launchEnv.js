/**
 * Environment for the Minecraft JVM process.
 *
 * On Linux we do NOT inherit the full parent env. Electron / AppImage / Cursor
 * inject LD_LIBRARY_PATH, APPDIR, and other vars that make NVIDIA GLX + GLFW
 * SIGSEGV inside glfwWaitEventsTimeout (org.lwjgl.system.JNI). Same crash is
 * seen from the old AwesomeCraft AppImage when it passes through its mount libs.
 *
 * Also force NVIDIA/Wayland workarounds before libGL loads (Sodium's in-process
 * setenv is often too late for the main GLFW event loop).
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

function isBundledLibPath(entry) {
  if (!entry) return false
  return (
    entry.includes('/.mount_') ||
    entry.includes('/tmp/.mount_') ||
    entry.includes('/app/lib') ||
    entry.includes('/usr/lib/pressurized') ||
    entry.includes('/opt/Cursor') ||
    entry.includes('/opt/cursor')
  )
}

function sanitizePath(value) {
  if (value == null || value === '') return '/usr/bin:/bin'
  const kept = String(value)
    .split(':')
    .map((p) => p.trim())
    .filter((p) => p && !isBundledLibPath(p) && !p.includes('/.mount_'))
  // Always ensure standard system paths exist for java/tools.
  for (const p of ['/usr/local/bin', '/usr/bin', '/bin']) {
    if (!kept.includes(p)) kept.push(p)
  }
  return kept.join(':')
}

function sanitizeLdLibraryPath(value) {
  if (value == null || value === '') return undefined
  const kept = String(value)
    .split(':')
    .map((p) => p.trim())
    .filter((p) => p && !isBundledLibPath(p))
  return kept.length > 0 ? kept.join(':') : undefined
}

function buildLinuxMinecraftEnv(baseEnv) {
  const env = {}

  for (const key of LINUX_PASSTHROUGH) {
    if (baseEnv[key] != null && baseEnv[key] !== '') {
      env[key] = baseEnv[key]
    }
  }

  // Locale fallbacks: copy any LC_* the parent has.
  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith('LC_') && value != null && value !== '' && env[key] == null) {
      env[key] = value
    }
  }

  env.PATH = sanitizePath(baseEnv.PATH)

  // Never inherit AppImage/Electron library overrides.
  const cleanedLd = sanitizeLdLibraryPath(baseEnv.LD_LIBRARY_PATH)
  if (cleanedLd) {
    env.LD_LIBRARY_PATH = cleanedLd
  }

  env.__GL_THREADED_OPTIMIZATIONS = '0'
  env.mesa_glthread = 'false'

  // Force X11/GLX (XWayland) — LWJGL 3.3 / MC 1.20.1 has no stable Wayland path.
  if (baseEnv.DISPLAY) {
    env.DISPLAY = baseEnv.DISPLAY
  }
  env.XDG_SESSION_TYPE = 'x11'
  env.GDK_BACKEND = 'x11'
  env.GLFW_PLATFORM = 'x11'
  env.QT_QPA_PLATFORM = 'xcb'
  // Intentionally omit WAYLAND_DISPLAY / XDG_SESSION_TYPE=wayland.

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
  sanitizeLdLibraryPath,
  sanitizePath,
  LINUX_PASSTHROUGH
}

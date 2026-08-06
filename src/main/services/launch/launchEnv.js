/**
 * Environment for the Minecraft JVM + host launcher sanitizers.
 *
 * Goal: Minecraft must run under a Wayland *desktop session* the same way
 * Prism / official launchers do — via GLFW X11 backend on XWayland. That does
 * NOT require logging into a legacy X11 session.
 *
 * Electron AppImages inject LD_LIBRARY_PATH, APPDIR, GTK/QT module paths, and
 * Wayland toolkit markers that make NVIDIA GLX + LWJGL GLFW SIGSEGV (null RIP
 * in glfwCreateWindow / glfwWaitEventsTimeout). Clearing LD_LIBRARY_PATH alone
 * is not enough: we whitelist env and spawn through `/usr/bin/env -i` so the
 * JVM never inherits AppImage linker state.
 *
 * Cold boot / first AppImage launch can still SIGSEGV in glfwWaitEventsTimeout
 * even with a clean JVM env + glxinfo: NVIDIA GLX needs a real present path
 * (window + swap), not just a context query. We warm with glxgears under the
 * same clean env, then fall back to glxinfo / nvidia-smi. Host PATH differences
 * (nvm vs AppImage) are not the fix; Minecraft gets a fixed system PATH.
 */

const child_process = require('child_process')
const fs = require('fs')
const path = require('path')

/** Deterministic PATH for the JVM — never inherit nvm / AppImage / node_modules. */
const LINUX_MINECRAFT_PATH = '/usr/local/bin:/usr/bin:/bin'

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

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath)
  } catch {
    return false
  }
}

function isNvidiaLinux() {
  return fileExists('/proc/driver/nvidia/version') || fileExists('/dev/nvidia0')
}

/**
 * Plasma / GNOME on Wayland put the XWayland cookie in XDG_RUNTIME_DIR/xauth_*
 * rather than ~/.Xauthority. Prefer an existing readable cookie file.
 */
function resolveXAuthority(baseEnv) {
  if (fileExists(baseEnv.XAUTHORITY)) {
    return baseEnv.XAUTHORITY
  }

  const runtimeDir = baseEnv.XDG_RUNTIME_DIR
  if (runtimeDir && fileExists(runtimeDir)) {
    try {
      const match = fs
        .readdirSync(runtimeDir)
        .filter((name) => name.startsWith('xauth_') || name === '.Xauthority')
        .map((name) => path.join(runtimeDir, name))
        .find((candidate) => fileExists(candidate))
      if (match) return match
    } catch {
      /* ignore */
    }
  }

  if (baseEnv.HOME) {
    const homeAuth = path.join(baseEnv.HOME, '.Xauthority')
    if (fileExists(homeAuth)) return homeAuth
  }

  return baseEnv.XAUTHORITY || undefined
}

/**
 * Whitelisted Linux env for Minecraft.
 * Desktop may be Wayland; the game uses GLFW X11 → XWayland (same as Prism default).
 */
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

  // Fixed system PATH — do not inherit nvm / AppImage / shell extras.
  env.PATH = LINUX_MINECRAFT_PATH
  // Explicitly omit LD_LIBRARY_PATH / LD_PRELOAD / APPDIR / APPIMAGE / ELECTRON_* / WAYLAND_*.

  env.__GL_THREADED_OPTIMIZATIONS = '0'
  env.mesa_glthread = 'false'

  if (baseEnv.DISPLAY) {
    env.DISPLAY = baseEnv.DISPLAY
  }

  const xauthority = resolveXAuthority(baseEnv)
  if (xauthority) {
    env.XAUTHORITY = xauthority
  }

  // Force GLFW/GLX on X11 (XWayland under a Wayland session). Native Wayland for
  // LWJGL 3.3 / MC 1.20.1 is unreliable; Prism defaults to the same path unless
  // the user installs a patched system GLFW.
  env.XDG_SESSION_TYPE = 'x11'
  env.GDK_BACKEND = 'x11'
  env.GLFW_PLATFORM = 'x11'
  env.SDL_VIDEODRIVER = 'x11'
  env.QT_QPA_PLATFORM = 'xcb'

  // AppImage / Flatpak-style GLVND can pick Mesa instead of the NVIDIA ICD.
  if (isNvidiaLinux()) {
    env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia'
    const nvidiaEglIcd = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json'
    if (fileExists(nvidiaEglIcd)) {
      env.__EGL_VENDOR_LIBRARY_FILENAMES = nvidiaEglIcd
    }
    // NVIDIA 555+ XWayland explicit sync has caused GLFW/GLX crashes; Prism-era workaround.
    env.__NV_DISABLE_EXPLICIT_SYNC = '1'
    // Avoid driver vsync path that trips glfwWaitEventsTimeout on cold XWayland.
    env.__GL_SYNC_TO_VBLANK = '0'
  }

  return env
}

function envPairsForSpawn(env) {
  return Object.entries(env)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
}

/**
 * Touch system GLX / NVIDIA with the same clean env Minecraft will use.
 * glxinfo alone is not enough: cold GLFW still SIGSEGVs in glfwWaitEventsTimeout
 * until something has presented frames on XWayland. Prefer a short glxgears run.
 */
function warmLinuxGraphics(env = {}, platform = process.platform) {
  if (platform !== 'linux' || !env.DISPLAY) {
    return { attempted: false, ok: false, command: null, status: null, timedOut: false }
  }

  const probes = [
    // Present path: timeout = success (gears ran and swapped buffers).
    { command: '/usr/bin/glxgears', args: [], timeoutMs: 1800, acceptTimeout: true },
    { command: '/usr/bin/glxinfo', args: ['-B'], timeoutMs: 10000, acceptTimeout: false },
    { command: '/usr/bin/nvidia-smi', args: ['-L'], timeoutMs: 10000, acceptTimeout: false }
  ]

  const pairs = envPairsForSpawn(env)
  let lastFailure = null

  for (const probe of probes) {
    if (!fileExists(probe.command)) continue
    try {
      const result = child_process.spawnSync(
        '/usr/bin/env',
        ['-i', ...pairs, probe.command, ...probe.args],
        {
          encoding: 'utf8',
          timeout: probe.timeoutMs,
          killSignal: 'SIGTERM',
          env: { PATH: '/usr/bin:/bin' },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      const timedOut = Boolean(
        result.error &&
        (result.error.code === 'ETIMEDOUT' || /ETIMEDOUT/i.test(String(result.error)))
      )
      const ok = probe.acceptTimeout
        ? timedOut || result.status === 0
        : result.status === 0 && !result.error

      if (ok) {
        return {
          attempted: true,
          ok: true,
          command: probe.command,
          status: result.status,
          timedOut,
          error: null
        }
      }

      lastFailure = {
        attempted: true,
        ok: false,
        command: probe.command,
        status: result.status,
        timedOut,
        error: result.error ? String(result.error.message || result.error) : null
      }
    } catch (err) {
      lastFailure = {
        attempted: true,
        ok: false,
        command: probe.command,
        status: null,
        timedOut: false,
        error: String(err && err.message ? err.message : err)
      }
    }
  }

  return (
    lastFailure || { attempted: false, ok: false, command: null, status: null, timedOut: false }
  )
}

function buildMinecraftProcessEnv(baseEnv = process.env, platform = process.platform) {
  if (platform === 'linux') {
    return buildLinuxMinecraftEnv(baseEnv)
  }
  return { ...baseEnv }
}

/**
 * Spawn Minecraft with a fully replaced environment (Linux).
 * `/usr/bin/env -i` guarantees AppImage LD_LIBRARY_PATH / APPDIR never leak in,
 * even if Node or the runtime tries to re-inject host vars.
 */
function spawnMinecraftProcess(command, args, options = {}, platform = process.platform) {
  const { cwd, detached = false, env = process.env } = options

  if (platform !== 'linux') {
    return child_process.spawn(command, args, { cwd, detached, env })
  }

  const envPairs = envPairsForSpawn(env)

  return child_process.spawn('/usr/bin/env', ['-i', ...envPairs, command, ...args], {
    cwd,
    detached,
    // Only used to locate /usr/bin/env itself; the Java process gets env -i.
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/**
 * Copy authlib-injector out of an AppImage/fuse mount into the durable data dir.
 * JVM -javaagent paths under /tmp/.mount_* are a common source of packaged-only bugs.
 */
function stageAuthlibInjector(sourcePath, commonDir) {
  if (!sourcePath || !commonDir) {
    return sourcePath
  }
  if (!isMountPath(sourcePath) && !sourcePath.includes(`${path.sep}resources${path.sep}`)) {
    // Dev / already-stable path: still stage so packaged and unpackaged share one location.
  }

  const destDir = path.join(commonDir, 'libraries', 'authlib-injector')
  const destPath = path.join(destDir, 'authlib-injector.jar')

  try {
    fs.mkdirSync(destDir, { recursive: true })
    const srcStat = fs.statSync(sourcePath)
    let needsCopy = !fs.existsSync(destPath)
    if (!needsCopy) {
      const destStat = fs.statSync(destPath)
      needsCopy = srcStat.size !== destStat.size || srcStat.mtimeMs > destStat.mtimeMs
    }
    if (needsCopy) {
      fs.copyFileSync(sourcePath, destPath)
    }
    return destPath
  } catch {
    return sourcePath
  }
}

module.exports = {
  buildMinecraftProcessEnv,
  sanitizeLauncherProcessEnv,
  sanitizeLdLibraryPath,
  sanitizePath,
  isBundledLibPath,
  isMountPath,
  resolveXAuthority,
  isNvidiaLinux,
  warmLinuxGraphics,
  spawnMinecraftProcess,
  stageAuthlibInjector,
  LINUX_PASSTHROUGH,
  LINUX_MINECRAFT_PATH
}

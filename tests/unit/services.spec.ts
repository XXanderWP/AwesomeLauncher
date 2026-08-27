import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { ConfigService, deepMerge } from '../../src/main/services/config/ConfigService'
import { fetchServerStatus } from '../../src/main/services/server-status/serverStatus'
import {
  fetchOnlinePlayers,
  formatPlaytime
} from '../../src/main/services/server-status/onlinePlayers'
import {
  parseElyUserIdFromHref,
  parseElyUserIdFromProfileHtml,
  resolveElybyPublicProfile
} from '../../src/main/services/auth/elybyPublicProfile'
import { getSupportedLanguages } from '../../src/shared/i18nResolve'
import {
  commonDirectory,
  instancesDirectory,
  instanceDirectory,
  javaDirectory,
  defaultDataDirectory,
  legacyDefaultDataDirectory
} from '../../src/main/utils/paths'
import {
  DISTRO_URL,
  ELYBY_AUTH_URL,
  DEFAULT_DATA_DIR_NAME,
  LEGACY_DATA_DIR_NAME
} from '../../src/shared/types'
import {
  dataDirectoryHasGameFiles,
  evaluateLegacyDataOffer
} from '../../src/main/services/config/legacyData'
import {
  extractMotdText,
  resolveServerDisplayName,
  stripMotdFormatting
} from '../../src/shared/serverDisplayName'
import {
  linuxDesktopFilePath,
  linuxIconFilePath,
  resolveLinuxExecPath
} from '../../src/main/services/desktop/linuxDesktopShortcut'
import {
  buildMacPrivilegedUpdateScript,
  compareVersions,
  macArchLabel,
  pickMacDmgAsset,
  resolveMacAppBundlePath
} from '../../src/main/services/updater/macManualUpdate'
import { getDefaultJvmOptions } from '../../src/shared/javaDefaults'

const { resolveNativeExtractPath } = require('../../src/main/services/launch/nativeExtract.js')
const {
  buildMinecraftProcessEnv,
  sanitizeLauncherProcessEnv,
  stageAuthlibInjector,
  resolveXAuthority,
  spawnMinecraftProcess,
  warmLinuxGraphics
} = require('../../src/main/services/launch/launchEnv.js')

jest.mock('helios-core/mojang', () => ({
  getServerStatus: jest.fn(async () => ({
    version: { name: '1.20.1', protocol: 47 },
    players: { max: 100, online: 12, sample: [] },
    description: { text: 'PWS Server' },
    favicon: '',
    retrievedAt: Date.now()
  }))
}))

describe('ConfigService', () => {
  it('loads defaults and persists accounts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-cfg-'))
    const previousAppData = process.env.APPDATA
    process.env.APPDATA = dir
    const service = new ConfigService(dir)
    const cfg = await service.load()
    expect(cfg.clientToken).toHaveLength(32)
    expect(cfg.settings.launcher.preservePlayerConfigs).toBe(true)
    expect(cfg.settings.launcher.discordRichPresence).toBe(true)
    expect(cfg.settings.launcher.legacyDataPromptSeen).toBe(false)
    expect(cfg.settings.launcher.language).toBe('system')
    expect(cfg.javaDefaults.maxRamMb).toBeGreaterThan(0)
    expect(cfg.javaDefaults.jvmOptions).toEqual(getDefaultJvmOptions())
    expect(cfg.cachedServerNames).toEqual({})

    await service.setAccount(
      {
        type: 'elyby',
        accessToken: 'a',
        username: 'u',
        uuid: '01234567-89ab-cdef-0123-456789abcdef',
        displayName: 'Steve'
      },
      true
    )
    expect(service.getSelectedAccount()?.displayName).toBe('Steve')

    await service.update({
      settings: { launcher: { language: 'ru' } }
    } as any)
    expect(service.getLanguageSetting()).toBe('ru')

    const java = service.getJavaSettings('Prominence', { minRamMb: 1000, maxRamMb: 2000 })
    expect(java.minRamMb).toBe(service.getJavaDefaults().minRamMb)
    await service.setJavaSettings('Prominence', { ...java, maxRamMb: 3000 })
    expect(service.getJavaSettings('Prominence').maxRamMb).toBe(3000)
    expect(service.hasJavaOverride('Prominence')).toBe(true)

    await service.removeAccount('01234567-89ab-cdef-0123-456789abcdef')
    expect(service.getSelectedAccount()).toBeNull()

    const reloaded = new ConfigService(dir)
    await reloaded.load()
    expect(reloaded.get().settings.launcher.language).toBe('ru')
    if (previousAppData == null) delete process.env.APPDATA
    else process.env.APPDATA = previousAppData
    await fs.remove(dir)
  })

  it('deepMerge keeps sibling keys', () => {
    const merged = deepMerge(
      { a: 1, nested: { x: 1, y: 2 }, list: [1] } as Record<string, unknown>,
      { nested: { y: 9 }, b: 3 } as Record<string, unknown>
    )
    expect(merged).toEqual({ a: 1, nested: { x: 1, y: 9 }, list: [1], b: 3 })
  })
})

describe('serverStatus', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function mockOnlinePlayersOk(online = 3, max = 50): void {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ online, max, players: [] })
    })) as unknown as typeof fetch
  }

  function mockOnlinePlayersFail(message = 'Request timed out'): void {
    global.fetch = jest.fn(async () => {
      throw new Error(message)
    }) as unknown as typeof fetch
  }

  it('maps online payload from minecraft ping', async () => {
    mockOnlinePlayersFail()
    const status = await fetchServerStatus('play.awesome-craft.ru', 25565)
    expect(status.online).toBe(true)
    expect(status.playersOnline).toBe(12)
    expect(status.playersMax).toBe(100)
    expect(status.versionName).toBe('1.20.1')
    expect(status.description).toBe('PWS Server')
    expect(status.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('stays online when ping fails but /online succeeds', async () => {
    const { getServerStatus } = require('helios-core/mojang')
    getServerStatus.mockRejectedValueOnce(new Error('timeout'))
    mockOnlinePlayersOk(7, 40)

    const status = await fetchServerStatus('play.awesome-craft.ru', 25565)
    expect(status.online).toBe(true)
    expect(status.playersOnline).toBe(7)
    expect(status.playersMax).toBe(40)
    expect(status.description).toBeNull()
  })

  it('prefers /online player counts when both succeed', async () => {
    mockOnlinePlayersOk(7, 40)
    const status = await fetchServerStatus('play.awesome-craft.ru', 25565)
    expect(status.online).toBe(true)
    expect(status.playersOnline).toBe(7)
    expect(status.playersMax).toBe(40)
    expect(status.description).toBe('PWS Server')
  })

  it('maps offline only when ping and /online both fail', async () => {
    const { getServerStatus } = require('helios-core/mojang')
    getServerStatus.mockRejectedValueOnce(new Error('timeout'))
    mockOnlinePlayersFail('connection refused')

    const status = await fetchServerStatus('offline.example', 25565)
    expect(status.online).toBe(false)
    expect(status.description).toBeNull()
    expect(status.error).toContain('timeout')
    expect(status.error).toContain('connection refused')
  })
})

describe('serverStatusHysteresis', () => {
  const {
    shouldConfirmOffline,
    OFFLINE_CONFIRM_DELAY_MS
  } = require('../../src/shared/serverStatusHysteresis')

  it('exports a 5s confirm delay', () => {
    expect(OFFLINE_CONFIRM_DELAY_MS).toBe(5000)
  })

  it('requires confirm only for online → offline', () => {
    expect(shouldConfirmOffline(true, false)).toBe(true)
    expect(shouldConfirmOffline(true, true)).toBe(false)
    expect(shouldConfirmOffline(false, false)).toBe(false)
    expect(shouldConfirmOffline(undefined, false)).toBe(false)
  })
})

describe('onlinePlayers', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('formats playtime as Dd Hh Mm Ss', () => {
    expect(formatPlaytime(3600)).toBe('0d 1h 0m 0s')
    expect(formatPlaytime(90061)).toBe('1d 1h 1m 1s')
  })

  it('maps /online payload', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        online: 2,
        max: 20,
        players: [
          {
            uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            playtime_ticks: 72000,
            playtime_seconds: 3600
          }
        ]
      })
    })) as unknown as typeof fetch

    const result = await fetchOnlinePlayers('127.0.0.1')
    expect(result.ok).toBe(true)
    expect(result.online).toBe(2)
    expect(result.max).toBe(20)
    expect(result.supportsOfflineList).toBe(false)
    expect(result.offline).toBe(0)
    expect(result.offlinePlayers).toEqual([])
    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      name: 'Notch',
      playtimeSeconds: 3600,
      playtimeFormatted: '0d 1h 0m 0s',
      sessionSeconds: null,
      sessionFormatted: null
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1313/online',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('maps session and offline_players from newer status mod', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        online: 1,
        max: 20,
        offline: 1,
        players: [
          {
            uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            playtime_ticks: 72000,
            playtime_seconds: 3600,
            session_seconds: 125,
            session_formatted: '0d 0h 2m 5s'
          }
        ],
        offline_players: [
          {
            uuid: '853c80ef-3c37-49fd-aa49-938b6391d71a',
            name: 'jeb_',
            playtime_ticks: 1000,
            playtime_seconds: 50
          }
        ]
      })
    })) as unknown as typeof fetch

    const result = await fetchOnlinePlayers('127.0.0.1')
    expect(result.ok).toBe(true)
    expect(result.supportsOfflineList).toBe(true)
    expect(result.offline).toBe(1)
    expect(result.players[0]).toMatchObject({
      sessionSeconds: 125,
      sessionFormatted: '0d 0h 2m 5s'
    })
    expect(result.offlinePlayers).toHaveLength(1)
    expect(result.offlinePlayers[0]).toMatchObject({
      uuid: '853c80ef-3c37-49fd-aa49-938b6391d71a',
      name: 'jeb_',
      playtimeSeconds: 50,
      playtimeFormatted: '0d 0h 0m 50s'
    })
  })

  it('formats session from seconds when session_formatted is missing', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        online: 1,
        max: 20,
        offline: 0,
        players: [
          {
            uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            playtime_ticks: 20,
            playtime_seconds: 1,
            session_seconds: 3661,
            session_formatted: null
          }
        ],
        offline_players: []
      })
    })) as unknown as typeof fetch

    const result = await fetchOnlinePlayers('127.0.0.1')
    expect(result.players[0].sessionSeconds).toBe(3661)
    expect(result.players[0].sessionFormatted).toBe('0d 1h 1m 1s')
  })

  it('maps HTTP errors', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'server_unavailable',
        message: 'Minecraft server is not ready'
      })
    })) as unknown as typeof fetch

    const result = await fetchOnlinePlayers('play.awesome-craft.ru')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not ready')
    expect(result.players).toEqual([])
    expect(result.offlinePlayers).toEqual([])
    expect(result.supportsOfflineList).toBe(false)
  })
})

describe('elybyPublicProfile', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('parses numeric user id from href and profile html', () => {
    expect(parseElyUserIdFromHref('/u3575339')).toBe(3575339)
    expect(parseElyUserIdFromHref('https://ely.by/u1')).toBe(1)
    expect(parseElyUserIdFromHref('/erickskrauch')).toBeUndefined()
    expect(
      parseElyUserIdFromProfileHtml('<div id="user-profile" al-init="wallId = 1"></div>')
    ).toBe(1)
  })

  it('returns /u{id} when search href includes numeric id', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/users/profiles/minecraft/XanderWP')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ id: 'a366830fc6d44b3ab6b07ccc3325e22f', name: 'XanderWP' })
        }
      }
      if (url.includes('/search/')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([{ nickname: 'XanderWP', href: '/u3575339', skin_url: null }])
        }
      }
      return { ok: false, status: 404, text: async () => '' }
    }) as unknown as typeof fetch

    const result = await resolveElybyPublicProfile({ username: 'XanderWP' })
    expect(result.found).toBe(true)
    expect(result.elyId).toBe(3575339)
    expect(result.profileUrl).toBe('https://ely.by/u3575339')
  })

  it('resolves vanity search href via wallId in profile html', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/user/profiles/') && url.endsWith('/names')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([{ name: 'ErickSkrauch' }])
        }
      }
      if (url.includes('/search/')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([{ nickname: 'ErickSkrauch', href: '/erickskrauch', skin_url: null }])
        }
      }
      if (url.includes('ely.by/erickskrauch')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<div id="user-profile" al-init="wallId = 1"></div>'
        }
      }
      return { ok: false, status: 404, text: async () => '' }
    }) as unknown as typeof fetch

    const result = await resolveElybyPublicProfile({
      uuid: 'ffc8fdc9-5824-509e-8a57-c99b940fb996',
      username: 'ErickSkrauch'
    })
    expect(result.found).toBe(true)
    expect(result.elyId).toBe(1)
    expect(result.profileUrl).toBe('https://ely.by/u1')
  })

  it('keeps profile non-clickable when USER_ID cannot be resolved', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/users/profiles/minecraft/')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: 'abc', name: 'NoPublicId' })
        }
      }
      if (url.includes('/search/')) {
        return { ok: true, status: 200, text: async () => JSON.stringify([]) }
      }
      return { ok: false, status: 404, text: async () => '' }
    }) as unknown as typeof fetch

    const result = await resolveElybyPublicProfile({ username: 'NoPublicId' })
    expect(result.found).toBe(true)
    expect(result.elyId).toBeNull()
    expect(result.profileUrl).toBeNull()
  })
})

describe('serverDisplayName', () => {
  it('extracts plain and nested MOTD text', () => {
    expect(extractMotdText('PWS Server')).toBe('PWS Server')
    expect(extractMotdText({ text: 'PWS Server' })).toBe('PWS Server')
    expect(
      extractMotdText({
        text: '',
        extra: [{ text: '§aPWS' }, { text: ' Server' }]
      })
    ).toBe('PWS Server')
    expect(extractMotdText('')).toBeNull()
    expect(extractMotdText(null)).toBeNull()
  })

  it('strips classic formatting codes', () => {
    expect(stripMotdFormatting('§cRed §lBold')).toBe('Red Bold')
  })

  it('prefers live MOTD, then cache, then distro name', () => {
    expect(resolveServerDisplayName('Distro Name', 'PWS Server', 'Cached')).toBe('PWS Server')
    expect(resolveServerDisplayName('Distro Name', null, 'Cached')).toBe('Cached')
    expect(resolveServerDisplayName('Distro Name', '  ', null)).toBe('Distro Name')
    expect(resolveServerDisplayName('Distro Name', undefined, undefined)).toBe('Distro Name')
  })
})

describe('nativeExtract', () => {
  it('keeps natives under the temp dir even when zip entry has a leading slash', () => {
    const nativeRoot = path.join(os.tmpdir(), 'natives')
    const dest = resolveNativeExtractPath(nativeRoot, '/libglfw.so')
    expect(dest).toBe(path.join(nativeRoot, 'libglfw.so'))
    expect(dest.startsWith(nativeRoot)).toBe(true)
  })

  it('uses basename for nested zip entries', () => {
    expect(resolveNativeExtractPath('/tmp/natives', 'linux/x64/liblwjgl.so')).toBe(
      path.join('/tmp/natives', 'liblwjgl.so')
    )
    expect(resolveNativeExtractPath('/tmp/natives', '..')).toBeNull()
  })
})

describe('launchEnv', () => {
  it('whitelists X11/XWayland env and drops AppImage/Wayland pollution for Minecraft', () => {
    const env = buildMinecraftProcessEnv(
      {
        PATH: '/tmp/.mount_App/usr/bin:/usr/bin',
        HOME: '/home/demo',
        DISPLAY: ':0',
        WAYLAND_DISPLAY: 'wayland-0',
        XDG_SESSION_TYPE: 'wayland',
        APPDIR: '/tmp/.mount_App',
        APPIMAGE: '/tmp/App.AppImage',
        LD_LIBRARY_PATH: '/tmp/.mount_App/usr/lib:/usr/lib',
        GTK_PATH: '/tmp/.mount_App/usr/lib/gtk',
        ELECTRON_RUN_AS_NODE: '1',
        __GL_THREADED_OPTIMIZATIONS: '1'
      },
      'linux'
    )
    expect(env.__GL_THREADED_OPTIMIZATIONS).toBe('0')
    expect(env.mesa_glthread).toBe('false')
    expect(env.WAYLAND_DISPLAY).toBeUndefined()
    expect(env.XDG_SESSION_TYPE).toBe('x11')
    expect(env.GDK_BACKEND).toBe('x11')
    expect(env.GLFW_PLATFORM).toBe('x11')
    expect(env.SDL_VIDEODRIVER).toBe('x11')
    expect(env.QT_QPA_PLATFORM).toBe('xcb')
    expect(env.DISPLAY).toBe(':0')
    expect(env.HOME).toBe('/home/demo')
    expect(env.APPDIR).toBeUndefined()
    expect(env.APPIMAGE).toBeUndefined()
    expect(env.GTK_PATH).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
    expect(env.PATH).toBe('/usr/local/bin:/usr/bin:/bin')
    expect(env.PATH).not.toContain('.mount_')
    // isNvidiaLinux() is host-dependent; when true the explicit-sync workaround is set.
    if (env.__GLX_VENDOR_LIBRARY_NAME === 'nvidia') {
      expect(env.__NV_DISABLE_EXPLICIT_SYNC).toBe('1')
      expect(env.__GL_SYNC_TO_VBLANK).toBe('0')
    }
  })

  it('uses the same fixed PATH for AppImage-like and npm-like host PATH', () => {
    const fromAppImage = buildMinecraftProcessEnv(
      {
        HOME: '/home/demo',
        DISPLAY: ':0',
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin'
      },
      'linux'
    )
    const fromNpm = buildMinecraftProcessEnv(
      {
        HOME: '/home/demo',
        DISPLAY: ':0',
        PATH: '/repo/node_modules/.bin:/home/demo/.nvm/versions/node/v22/bin:/usr/bin'
      },
      'linux'
    )
    expect(fromAppImage.PATH).toBe(fromNpm.PATH)
    expect(fromAppImage.PATH).toBe('/usr/local/bin:/usr/bin:/bin')
  })

  it('skips GL warm-up when DISPLAY is missing', () => {
    const warm = warmLinuxGraphics({ PATH: '/usr/bin:/bin' }, 'linux')
    expect(warm.attempted).toBe(false)
  })

  it('prefers glxgears present warm-up when DISPLAY is set', () => {
    if (process.platform !== 'linux' || !process.env.DISPLAY) {
      return
    }
    if (!fs.existsSync('/usr/bin/glxgears')) {
      return
    }
    const warm = warmLinuxGraphics(
      {
        DISPLAY: process.env.DISPLAY,
        PATH: '/usr/bin:/bin',
        XAUTHORITY: process.env.XAUTHORITY,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
        HOME: process.env.HOME
      },
      'linux'
    )
    expect(warm.attempted).toBe(true)
    expect(warm.ok).toBe(true)
    expect(warm.command).toBe('/usr/bin/glxgears')
    expect(warm.timedOut).toBe(true)
  })

  it('resolves XAUTHORITY from XDG_RUNTIME_DIR xauth cookie on Wayland', () => {
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'al-xauth-'))
    const cookie = path.join(runtime, 'xauth_testcookie')
    fs.writeFileSync(cookie, 'cookie')
    try {
      expect(
        resolveXAuthority({
          XDG_RUNTIME_DIR: runtime
        })
      ).toBe(cookie)
    } finally {
      fs.removeSync(runtime)
    }
  })

  it('stages authlib-injector into commonDir outside AppImage mounts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'al-authlib-'))
    const mountJar = path.join(root, '.mount_AwesomTEST', 'authlib-injector.jar')
    const commonDir = path.join(root, 'common')
    fs.ensureDirSync(path.dirname(mountJar))
    fs.writeFileSync(mountJar, 'authlib-bytes')
    try {
      const staged = stageAuthlibInjector(mountJar, commonDir)
      expect(staged).toBe(
        path.join(commonDir, 'libraries', 'authlib-injector', 'authlib-injector.jar')
      )
      expect(fs.readFileSync(staged, 'utf8')).toBe('authlib-bytes')
      expect(staged).not.toContain('.mount_')
    } finally {
      fs.removeSync(root)
    }
  })

  it('spawns Linux Minecraft through env -i for AppImage isolation', () => {
    if (process.platform !== 'linux') return
    const child = spawnMinecraftProcess(
      '/bin/true',
      [],
      {
        cwd: os.tmpdir(),
        env: { HOME: '/home/demo', DISPLAY: ':0', PATH: '/usr/bin:/bin' }
      },
      'linux'
    )
    expect(child.spawnfile).toBe('/usr/bin/env')
    // spawnargs[0] is the executable for some node versions; check command line pieces
    const args = child.spawnargs || []
    expect(args).toEqual(
      expect.arrayContaining(['-i', 'HOME=/home/demo', 'DISPLAY=:0', '/bin/true'])
    )
    child.kill()
  })

  it('strips foreign Cursor mounts from the host launcher env', () => {
    const env: Record<string, string | undefined> = {
      APPDIR: '/tmp/.mount_AwesomABC',
      LD_LIBRARY_PATH: '/tmp/.mount_CursorkgdGBD/usr/lib:/tmp/.mount_AwesomABC/usr/lib:/usr/lib',
      PATH: '/tmp/.mount_CursorkgdGBD/usr/bin:/tmp/.mount_AwesomABC/usr/bin:/usr/bin'
    }
    const result = sanitizeLauncherProcessEnv(env, 'linux')
    expect(result.changed).toBe(true)
    expect(env.LD_LIBRARY_PATH).toBe('/tmp/.mount_AwesomABC/usr/lib:/usr/lib')
    expect(env.PATH).not.toContain('Cursor')
    expect(env.PATH).toContain('/tmp/.mount_AwesomABC/usr/bin')
  })

  it('clears host LD_LIBRARY_PATH when only foreign mounts remain', () => {
    const env: Record<string, string | undefined> = {
      LD_LIBRARY_PATH: '/tmp/.mount_CursorkgdGBD/usr/lib/'
    }
    sanitizeLauncherProcessEnv(env, 'linux')
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
  })

  it('does not rewrite env on non-Linux platforms', () => {
    const env = buildMinecraftProcessEnv({ PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' }, 'win32')
    expect(env.__GL_THREADED_OPTIMIZATIONS).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })
})

describe('linuxDesktopShortcut paths', () => {
  it('prefers APPIMAGE env for Exec path', () => {
    expect(resolveLinuxExecPath({ APPIMAGE: '/tmp/App.AppImage' }, '/usr/bin/electron')).toBe(
      '/tmp/App.AppImage'
    )
    expect(resolveLinuxExecPath({}, '/usr/bin/electron')).toBe('/usr/bin/electron')
  })

  it('builds XDG applications and icon paths', () => {
    expect(linuxDesktopFilePath('/home/demo')).toBe(
      '/home/demo/.local/share/applications/ru.awesomecraft.launcher.desktop'
    )
    expect(linuxIconFilePath('/home/demo')).toContain(
      '/home/demo/.local/share/icons/hicolor/256x256/apps/ru.awesomecraft.launcher.png'
    )
  })
})

describe('macManualUpdate helpers', () => {
  it('compares versions and resolves arch / app path', () => {
    expect(compareVersions('1.1.2', '1.1.1')).toBeGreaterThan(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(macArchLabel('arm64')).toBe('arm64')
    expect(macArchLabel('x64')).toBe('x64')
    expect(
      resolveMacAppBundlePath(
        '/Applications/AwesomeCraftLauncher.app/Contents/MacOS/AwesomeCraftLauncher'
      )
    ).toBe('/Applications/AwesomeCraftLauncher.app')
  })

  it('picks the arch-specific DMG asset', () => {
    const assets = [
      {
        name: 'AwesomeLauncher-x64.dmg',
        browser_download_url: 'https://example.com/x64.dmg'
      },
      {
        name: 'AwesomeLauncher-arm64.dmg',
        browser_download_url: 'https://example.com/arm64.dmg'
      }
    ]
    expect(pickMacDmgAsset(assets, '1.1.2', 'arm64')?.browser_download_url).toContain('arm64')
    expect(pickMacDmgAsset(assets, '1.1.2', 'x64')?.name).toContain('x64')
  })

  it('builds a privileged install script with download, replace, and xattr', () => {
    const script = buildMacPrivilegedUpdateScript({
      dmgUrl: 'https://example.com/app.dmg',
      appPath: '/Applications/AwesomeCraftLauncher.app'
    })
    expect(script).toContain("URL='https://example.com/app.dmg'")
    expect(script).toContain('curl -fL')
    expect(script).toContain('hdiutil attach')
    expect(script).toContain('ditto')
    expect(script).toContain('xattr -dr com.apple.quarantine')
    expect(script).not.toContain('with administrator privileges')
    expect(script).toContain('open "$APP_DEST"')
  })
})

describe('path helpers and constants', () => {
  it('builds data subdirectories', () => {
    expect(commonDirectory('/data')).toBe(path.join('/data', 'common'))
    expect(instancesDirectory('/data')).toBe(path.join('/data', 'instances'))
    expect(instanceDirectory('/data', 'Prominence')).toBe(
      path.join('/data', 'instances', 'Prominence')
    )
    expect(javaDirectory('/data')).toBe(path.join('/data', 'java'))
    expect(DEFAULT_DATA_DIR_NAME).toBe('.awesomelauncher')
    expect(LEGACY_DATA_DIR_NAME).toBe('.helioslauncher')
    expect(defaultDataDirectory()).toContain(DEFAULT_DATA_DIR_NAME)
    expect(defaultDataDirectory()).not.toContain('helioslauncher')
    expect(defaultDataDirectory()).not.toContain('awesomecraftlauncher')
    expect(legacyDefaultDataDirectory()).toContain(LEGACY_DATA_DIR_NAME)
    expect(legacyDefaultDataDirectory()).not.toContain(DEFAULT_DATA_DIR_NAME)
  })

  it('exposes remote constants', () => {
    expect(DISTRO_URL).toContain('distribution.json')
    expect(ELYBY_AUTH_URL).toContain('ely.by')
    expect(getSupportedLanguages()).toEqual(['en', 'ru', 'uk'])
  })
})

describe('legacy data offer', () => {
  it('detects game files and empty folders', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-empty-'))
    const fullDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-full-'))
    await fs.ensureDir(path.join(fullDir, 'common', 'libraries', 'net'))
    await fs.writeFile(path.join(fullDir, 'common', 'libraries', 'net', 'x.jar'), 'x')

    expect(await dataDirectoryHasGameFiles(emptyDir)).toBe(false)
    expect(await dataDirectoryHasGameFiles(path.join(emptyDir, 'missing'))).toBe(false)
    expect(await dataDirectoryHasGameFiles(fullDir)).toBe(true)

    await fs.remove(emptyDir)
    await fs.remove(fullDir)
  })

  it('offers only when current is empty, legacy has data, and prompt unseen', async () => {
    const current = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-cur-'))
    const legacy = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-leg-'))
    await fs.ensureDir(path.join(legacy, 'instances', 'Prominence'))
    await fs.writeFile(path.join(legacy, 'instances', 'Prominence', 'options.txt'), 'x')

    await expect(
      evaluateLegacyDataOffer({
        currentDataDirectory: current,
        legacyDataPromptSeen: false,
        legacyPath: legacy
      })
    ).resolves.toEqual({ shouldOffer: true, legacyPath: legacy })

    await expect(
      evaluateLegacyDataOffer({
        currentDataDirectory: current,
        legacyDataPromptSeen: true,
        legacyPath: legacy
      })
    ).resolves.toEqual({ shouldOffer: false, legacyPath: legacy })

    await expect(
      evaluateLegacyDataOffer({
        currentDataDirectory: legacy,
        legacyDataPromptSeen: false,
        legacyPath: legacy
      })
    ).resolves.toEqual({ shouldOffer: false, legacyPath: legacy })

    await fs.ensureDir(path.join(current, 'sync-index'))
    await fs.writeJson(path.join(current, 'sync-index', 'Prominence.json'), { paths: [] })
    await expect(
      evaluateLegacyDataOffer({
        currentDataDirectory: current,
        legacyDataPromptSeen: false,
        legacyPath: legacy
      })
    ).resolves.toEqual({ shouldOffer: false, legacyPath: legacy })

    await fs.remove(current)
    await fs.remove(legacy)
  })
})

describe('protocol deep links', () => {
  const {
    buildDiscordJoinButtonUrl,
    buildProtocolLaunchUrl,
    findProtocolUrlInArgv,
    parseLaunchProtocolUrl
  } = require('../../src/shared/protocol') as typeof import('../../src/shared/protocol')

  it('parses launch URLs', () => {
    expect(parseLaunchProtocolUrl('awesomelauncher://launch/Prominence')).toEqual({
      serverId: 'Prominence'
    })
    expect(parseLaunchProtocolUrl('awesomelauncher://launch?server=Prominence')).toEqual({
      serverId: 'Prominence'
    })
    expect(parseLaunchProtocolUrl('awesomelauncher://launch/My%20Server')).toEqual({
      serverId: 'My Server'
    })
    expect(parseLaunchProtocolUrl('https://example.com')).toBeNull()
  })

  it('finds protocol args and builds join URLs', () => {
    expect(findProtocolUrlInArgv(['node', 'app', 'awesomelauncher://launch/Prominence'])).toBe(
      'awesomelauncher://launch/Prominence'
    )
    expect(buildProtocolLaunchUrl('Prominence')).toBe('awesomelauncher://launch/Prominence')
    expect(buildDiscordJoinButtonUrl('Prominence')).toContain('server=Prominence')
    expect(buildDiscordJoinButtonUrl('Prominence')).toContain('join.html')
  })
})

describe('discord presence helpers', () => {
  const {
    DISCORD_ASSET_MAIN,
    DISCORD_ASSET_PROMINENCE,
    getPresenceStrings,
    normalizeUuid,
    resolveLargeImageKey
  } =
    require('../../src/main/services/discord/presenceText') as typeof import('../../src/main/services/discord/presenceText')
  const { isJoinBridgeAvailable, resetJoinBridgeAvailabilityCache } =
    require('../../src/main/services/discord/joinBridge') as typeof import('../../src/main/services/discord/joinBridge')

  beforeEach(() => {
    resetJoinBridgeAvailabilityCache()
  })

  it('normalizes uuids and picks asset keys', () => {
    expect(normalizeUuid('01234567-89AB-CDEF-0123-456789ABCDEF')).toBe(
      '0123456789abcdef0123456789abcdef'
    )
    expect(resolveLargeImageKey({ gameRunning: false })).toBe(DISCORD_ASSET_MAIN)
    expect(resolveLargeImageKey({ gameRunning: true })).toBe(DISCORD_ASSET_PROMINENCE)
    expect(
      resolveLargeImageKey({
        gameRunning: true,
        serverIconUrl: 'https://cdn.example/icon.png'
      })
    ).toBe('https://cdn.example/icon.png')
  })

  it('localizes on-server status with a middle dot', () => {
    expect(getPresenceStrings('ru').onServer('XanderWP')).toBe('На сервере · XanderWP')
    expect(getPresenceStrings('en').inLauncher('1.1.15')).toBe('In the launcher · 1.1.15')
    expect(getPresenceStrings('ru').inLauncher('1.1.15')).toBe('В лаунчере · 1.1.15')
  })

  it('probes join bridge and caches the result', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    await expect(isJoinBridgeAvailable(fetchImpl as typeof fetch, 1_000)).resolves.toBe(false)
    await expect(isJoinBridgeAvailable(fetchImpl as typeof fetch, 2_000)).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    resetJoinBridgeAvailabilityCache()
    await expect(isJoinBridgeAvailable(fetchImpl as typeof fetch, 3_000)).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('prominence presence bridge', () => {
  const {
    parseLevelsState,
    parseSdrpPresenceLogLine,
    extractLatestProminencePresence,
    ensureSdrpLogState
  } =
    require('../../src/main/services/discord/prominencePresence') as typeof import('../../src/main/services/discord/prominencePresence')
  const fs = require('fs-extra') as typeof import('fs-extra')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')

  it('parses Prominence level/item-level state lines', () => {
    expect(parseLevelsState('Level 42 | 850 Item Level')).toEqual({
      levels: 'Level 42 | 850 Item Level',
      playerLevel: 42,
      itemLevel: 850
    })
    expect(parseLevelsState('In Overworld')).toBeNull()
  })

  it('parses SDRP logState JSON into location and levels', () => {
    const line =
      '[pool-3-thread-1/INFO]: Sent state to discord: {"state":"Level 12 | 340 Item Level","details":"📍 Plains, Overworld","assets":{"large_image":"logo"}}'
    const parsed = parseSdrpPresenceLogLine(line)
    expect(parsed).toMatchObject({
      location: '📍 Plains, Overworld',
      levels: 'Level 12 | 340 Item Level',
      playerLevel: 12,
      itemLevel: 340
    })
  })

  it('picks the latest matching log line', () => {
    const latest = extractLatestProminencePresence([
      {
        text: 'Sent state to discord: {"state":"Level 1 | 10 Item Level","details":"📍 Beach, Overworld"}',
        timestamp: 1
      },
      { text: 'unrelated', timestamp: 2 },
      {
        text: 'Sent state to discord: {"state":"Level 5 | 99 Item Level","details":"📍 Forest, the_nether"}',
        timestamp: 3
      }
    ])
    expect(latest?.playerLevel).toBe(5)
    expect(latest?.itemLevel).toBe(99)
    expect(latest?.location).toContain('Forest')
  })

  it('enables SDRP logState once in the instance config', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'al-sdrp-'))
    const configPath = path.join(dir, 'config', 'sdrp-common.json')
    await fs.outputJson(configPath, {
      clientId: '1273573655041015889',
      enabled: true,
      screenEvent: true,
      clientJoinEvent: true,
      logState: false
    })

    await expect(ensureSdrpLogState(dir)).resolves.toBe(true)
    await expect(ensureSdrpLogState(dir)).resolves.toBe(false)
    expect((await fs.readJson(configPath)).logState).toBe(true)
    await fs.remove(dir)
  })
})

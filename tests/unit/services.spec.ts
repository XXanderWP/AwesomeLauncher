import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { ConfigService, deepMerge } from '../../src/main/services/config/ConfigService'
import { fetchServerStatus } from '../../src/main/services/server-status/serverStatus'
import { getSupportedLanguages } from '../../src/shared/i18nResolve'
import {
  commonDirectory,
  instancesDirectory,
  instanceDirectory,
  javaDirectory,
  defaultDataDirectory
} from '../../src/main/utils/paths'
import { DISTRO_URL, ELYBY_AUTH_URL, DEFAULT_DATA_DIR_NAME } from '../../src/shared/types'
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

const { resolveNativeExtractPath } = require('../../src/main/services/launch/nativeExtract.js')
const {
  buildMinecraftProcessEnv,
  sanitizeLauncherProcessEnv
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
    const service = new ConfigService(dir)
    const cfg = await service.load()
    expect(cfg.clientToken).toHaveLength(32)
    expect(cfg.settings.launcher.preservePlayerConfigs).toBe(true)
    expect(cfg.settings.launcher.language).toBe('system')
    expect(cfg.javaDefaults.maxRamMb).toBeGreaterThan(0)
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
  it('maps online payload', async () => {
    const status = await fetchServerStatus('play.awesome-craft.ru', 25565)
    expect(status.online).toBe(true)
    expect(status.playersOnline).toBe(12)
    expect(status.playersMax).toBe(100)
    expect(status.versionName).toBe('1.20.1')
    expect(status.description).toBe('PWS Server')
    expect(status.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('maps offline errors', async () => {
    const { getServerStatus } = require('helios-core/mojang')
    getServerStatus.mockRejectedValueOnce(new Error('timeout'))
    const status = await fetchServerStatus('offline.example', 25565)
    expect(status.online).toBe(false)
    expect(status.description).toBeNull()
    expect(status.error).toContain('timeout')
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
    const dest = resolveNativeExtractPath('/tmp/natives', '/libglfw.so')
    expect(dest).toBe(path.join('/tmp/natives', 'libglfw.so'))
    expect(dest.startsWith('/tmp/natives')).toBe(true)
  })

  it('uses basename for nested zip entries', () => {
    expect(resolveNativeExtractPath('/tmp/natives', 'linux/x64/liblwjgl.so')).toBe(
      path.join('/tmp/natives', 'liblwjgl.so')
    )
    expect(resolveNativeExtractPath('/tmp/natives', '..')).toBeNull()
  })
})

describe('launchEnv', () => {
  it('builds a clean Linux env with NVIDIA/X11 workarounds', () => {
    const env = buildMinecraftProcessEnv(
      {
        PATH: '/tmp/.mount_Cursor/usr/bin:/usr/bin',
        HOME: '/home/demo',
        DISPLAY: ':0',
        WAYLAND_DISPLAY: 'wayland-0',
        XDG_SESSION_TYPE: 'wayland',
        APPDIR: '/tmp/.mount_App',
        LD_LIBRARY_PATH: '/tmp/.mount_App/usr/lib:/usr/lib',
        ELECTRON_RUN_AS_NODE: '1',
        __GL_THREADED_OPTIMIZATIONS: '1'
      },
      'linux'
    )
    expect(env.__GL_THREADED_OPTIMIZATIONS).toBe('0')
    expect(env.GLFW_PLATFORM).toBe('x11')
    expect(env.GDK_BACKEND).toBe('x11')
    expect(env.XDG_SESSION_TYPE).toBe('x11')
    expect(env.DISPLAY).toBe(':0')
    expect(env.HOME).toBe('/home/demo')
    expect(env.WAYLAND_DISPLAY).toBeUndefined()
    expect(env.APPDIR).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
    expect(env.PATH).not.toContain('.mount_')
    expect(env.PATH).toContain('/usr/bin')
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
    expect(defaultDataDirectory()).toContain(DEFAULT_DATA_DIR_NAME)
    expect(defaultDataDirectory()).not.toContain('helioslauncher')
    expect(defaultDataDirectory()).not.toContain('awesomecraftlauncher')
  })

  it('exposes remote constants', () => {
    expect(DISTRO_URL).toContain('distribution.json')
    expect(ELYBY_AUTH_URL).toContain('ely.by')
    expect(getSupportedLanguages()).toEqual(['en', 'ru', 'uk'])
  })
})

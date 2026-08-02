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

const { resolveNativeExtractPath } = require('../../src/main/services/launch/nativeExtract.js')

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

describe('path helpers and constants', () => {
  it('builds data subdirectories', () => {
    expect(commonDirectory('/data')).toBe(path.join('/data', 'common'))
    expect(instancesDirectory('/data')).toBe(path.join('/data', 'instances'))
    expect(instanceDirectory('/data', 'Prominence')).toBe(
      path.join('/data', 'instances', 'Prominence')
    )
    expect(javaDirectory('/data')).toBe(path.join('/data', 'java'))
    expect(defaultDataDirectory()).toContain(DEFAULT_DATA_DIR_NAME)
  })

  it('exposes remote constants', () => {
    expect(DISTRO_URL).toContain('distribution.json')
    expect(ELYBY_AUTH_URL).toContain('ely.by')
    expect(getSupportedLanguages()).toEqual(['en', 'ru', 'uk'])
  })
})

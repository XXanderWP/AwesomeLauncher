import {
  isPlayerMutablePath,
  shouldPreserveExistingFile,
  normalizeGameRelativePath,
  canDeleteOrphanTrackedPath,
  isFullyImmunePath,
  isUserModsPath
} from '../../src/shared/syncRules'
import { resolveLanguage, isSupportedLanguage } from '../../src/shared/i18nResolve'
import { parseHostPort, clamp, formatBytes } from '../../src/main/utils/paths'
import {
  normalizeProfileUuid,
  createClientToken,
  accountFromAuthResponse
} from '../../src/main/services/auth/elybyAuth'
import {
  backupPreservedFiles,
  removeUnbackedUserMods,
  restorePreservedFiles
} from '../../src/main/services/download/preserveBackup'
import {
  collectDistributionModules,
  instanceRelativePath,
  removeOrphanTrackedFiles,
  shouldSkipRemoteModule
} from '../../src/main/services/download/fileSync'
import {
  loadServerFileIndex,
  saveServerFileIndex
} from '../../src/main/services/download/serverFileIndex'
import { validateRamLimits, clampRamMb } from '../../src/shared/ramValidation'
import {
  elybySkinUrl,
  elybyProfileUrl,
  parseElyAccountId,
  shortUuid
} from '../../src/shared/elybyProfile'

describe('syncRules / preservePaths', () => {
  it('normalizes separators', () => {
    expect(normalizeGameRelativePath('.\\config\\foo.json')).toBe('config/foo.json')
  })

  it('protects options, config, user mods, logs, and saves', () => {
    expect(isPlayerMutablePath('options.txt')).toBe(true)
    expect(isPlayerMutablePath('optionsshaders.txt')).toBe(true)
    expect(isPlayerMutablePath('optionshaders.txt')).toBe(true)
    expect(isPlayerMutablePath('config/sodium-options.json')).toBe(true)
    expect(isPlayerMutablePath('config/yosbr/options.txt')).toBe(true)
    expect(isPlayerMutablePath('mods/example.jar')).toBe(true)
    expect(isPlayerMutablePath('logs/latest.log')).toBe(true)
    expect(isPlayerMutablePath('saves/world/level.dat')).toBe(true)
  })

  it('allows sync updates for pack content outside protected paths', () => {
    expect(isPlayerMutablePath('servers.dat')).toBe(false)
    expect(isPlayerMutablePath('resourcepacks/pack.zip')).toBe(false)
    expect(isPlayerMutablePath('shaderpacks/pack.zip')).toBe(false)
    expect(isPlayerMutablePath('datapacks/pack.zip')).toBe(false)
  })

  it('preserves only when enabled and file exists', () => {
    expect(shouldPreserveExistingFile('options.txt', true, true)).toBe(true)
    expect(shouldPreserveExistingFile('options.txt', false, true)).toBe(false)
    expect(shouldPreserveExistingFile('options.txt', true, false)).toBe(false)
    expect(shouldPreserveExistingFile('mods/a.jar', true, true)).toBe(true)
    expect(shouldPreserveExistingFile('resourcepacks/a.zip', true, true)).toBe(false)
  })
})

describe('i18nResolve', () => {
  it('detects supported languages', () => {
    expect(isSupportedLanguage('en')).toBe(true)
    expect(isSupportedLanguage('ru')).toBe(true)
    expect(isSupportedLanguage('uk')).toBe(true)
    expect(isSupportedLanguage('de')).toBe(false)
  })

  it('uses explicit setting over system', () => {
    expect(resolveLanguage('ru', 'en-US')).toBe('ru')
    expect(resolveLanguage('uk', 'ru-RU')).toBe('uk')
  })

  it('resolves system locale and falls back to english', () => {
    expect(resolveLanguage('system', 'ru-RU')).toBe('ru')
    expect(resolveLanguage('system', 'uk_UA')).toBe('uk')
    expect(resolveLanguage('system', 'en-GB')).toBe('en')
    expect(resolveLanguage('system', 'de-DE')).toBe('en')
    expect(resolveLanguage('system', null)).toBe('en')
  })
})

describe('paths utils', () => {
  it('parses host:port', () => {
    expect(parseHostPort('play.awesome-craft.ru')).toEqual({
      host: 'play.awesome-craft.ru',
      port: 25565
    })
    expect(parseHostPort('play.awesome-craft.ru:25566')).toEqual({
      host: 'play.awesome-craft.ru',
      port: 25566
    })
    expect(parseHostPort('[::1]:25565')).toEqual({ host: '::1', port: 25565 })
  })

  it('clamps numbers', () => {
    expect(clamp(5, 1, 3)).toBe(3)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(4, 1, 10)).toBe(4)
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('elybyAuth helpers', () => {
  it('normalizes uuids', () => {
    expect(normalizeProfileUuid('0123456789abcdef0123456789abcdef')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef'
    )
    expect(normalizeProfileUuid('01234567-89AB-CDEF-0123-456789ABCDEF')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef'
    )
  })

  it('creates client tokens', () => {
    const token = createClientToken()
    expect(token).toHaveLength(32)
    expect(token).toMatch(/^[a-f0-9]+$/)
  })

  it('maps auth response to account', () => {
    const account = accountFromAuthResponse({
      accessToken: 'token',
      clientToken: 'client',
      selectedProfile: { id: '0123456789abcdef0123456789abcdef', name: 'Steve' },
      user: { id: 'u1', username: 'steve@ely.by' }
    })
    expect(account).toEqual({
      type: 'elyby',
      accessToken: 'token',
      username: 'steve@ely.by',
      uuid: '01234567-89ab-cdef-0123-456789abcdef',
      displayName: 'Steve',
      elyId: undefined
    })
  })

  it('keeps numeric ely account id from auth user', () => {
    const account = accountFromAuthResponse({
      accessToken: 'token',
      clientToken: 'client',
      selectedProfile: { id: '0123456789abcdef0123456789abcdef', name: 'XanderWP' },
      user: { id: '3575339', username: 'XanderWP' }
    })
    expect(account.elyId).toBe(3575339)
    expect(account.username).toBe('XanderWP')
  })
})

describe('ramValidation', () => {
  it('flags min>max and full memory as unsavable', () => {
    const bad = validateRamLimits(8000, 4000, 16000)
    expect(bad.minGreaterThanMax).toBe(true)
    expect(bad.canSave).toBe(false)

    const full = validateRamLimits(2048, 16000, 16000)
    expect(full.maxAtOrAboveTotal).toBe(true)
    expect(full.canSave).toBe(false)
  })

  it('sets yellow and red warning levels by ratio', () => {
    expect(validateRamLimits(1024, 9000, 16000).warningLevel).toBe('yellow')
    expect(validateRamLimits(1024, 13000, 16000).warningLevel).toBe('red')
    expect(validateRamLimits(1024, 4096, 16000).warningLevel).toBe('none')
  })

  it('clamps ram values', () => {
    expect(clampRamMb(100, 512, 8192)).toBe(512)
    expect(clampRamMb(99999, 512, 8192)).toBe(8192)
  })
})

describe('elybyProfile helpers', () => {
  it('builds skin and profile urls', () => {
    expect(elybySkinUrl('Steve', 1)).toContain('/skins/Steve.png')
    expect(elybyProfileUrl({ username: 'XanderWP', displayName: 'XanderWP', elyId: 3575339 })).toBe(
      'https://ely.by/u3575339'
    )
    expect(elybyProfileUrl({ username: 'XanderWP', displayName: 'XanderWP' })).toBe(
      'https://account.ely.by/'
    )
  })

  it('parses numeric ely account ids', () => {
    expect(parseElyAccountId(3575339)).toBe(3575339)
    expect(parseElyAccountId('3575339')).toBe(3575339)
    expect(parseElyAccountId('abc')).toBeUndefined()
  })

  it('shortens uuids', () => {
    expect(shortUuid('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567…cdef')
  })
})

describe('preserveBackup', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')

  it('backs up and restores protected files including user mods', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-test-'))
    await fs.outputFile(path.join(root, 'options.txt'), 'lang:en_us')
    await fs.outputFile(path.join(root, 'config', 'demo.json'), '{"a":1}')
    await fs.outputFile(path.join(root, 'mods', 'demo.jar'), 'jar')
    await fs.outputFile(path.join(root, 'resourcepacks', 'pack.zip'), 'pack')
    await fs.outputFile(path.join(root, 'logs', 'latest.log'), 'log')
    await fs.outputFile(path.join(root, 'saves', 'world', 'level.dat'), 'save')

    const entries = await backupPreservedFiles(root, true)
    expect(entries.map((e) => e.relativePath).sort()).toEqual([
      'config/demo.json',
      'mods/demo.jar',
      'options.txt'
    ])

    await fs.writeFile(path.join(root, 'options.txt'), 'OVERWRITTEN')
    await fs.writeFile(path.join(root, 'config', 'demo.json'), 'OVERWRITTEN')
    await fs.writeFile(path.join(root, 'mods', 'demo.jar'), 'OVERWRITTEN')
    await fs.outputFile(path.join(root, 'mods', 'forced-pack.jar'), 'forced')

    const restored = await restorePreservedFiles(entries)
    expect(restored).toBe(3)
    expect(await fs.readFile(path.join(root, 'options.txt'), 'utf8')).toBe('lang:en_us')
    expect(await fs.readFile(path.join(root, 'config', 'demo.json'), 'utf8')).toBe('{"a":1}')
    expect(await fs.readFile(path.join(root, 'mods', 'demo.jar'), 'utf8')).toBe('jar')

    const purged = await removeUnbackedUserMods(root, entries)
    expect(purged).toBe(1)
    expect(await fs.pathExists(path.join(root, 'mods', 'forced-pack.jar'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'logs', 'latest.log'), 'utf8')).toBe('log')
    expect(await fs.readFile(path.join(root, 'saves', 'world', 'level.dat'), 'utf8')).toBe('save')
    expect(await fs.readFile(path.join(root, 'resourcepacks', 'pack.zip'), 'utf8')).toBe('pack')

    await fs.remove(root)
  })

  it('skips config backup when preserve disabled but still protects options and mods', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-test-'))
    await fs.outputFile(path.join(root, 'options.txt'), 'x')
    await fs.outputFile(path.join(root, 'config', 'a.json'), 'c')
    await fs.outputFile(path.join(root, 'mods', 'u.jar'), 'm')
    const entries = await backupPreservedFiles(root, false)
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['mods/u.jar', 'options.txt'])
    await fs.remove(root)
  })
})

describe('serverFileIndex + orphan sync', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')

  it('persists tracked paths per server', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-index-'))
    await saveServerFileIndex(dataDir, 'Prominence', [
      'instances/Prominence/config/a.json',
      'common/mods/fabric/demo.jar'
    ])
    const loaded = await loadServerFileIndex(dataDir, 'Prominence')
    expect(loaded?.trackedPaths).toEqual([
      'common/mods/fabric/demo.jar',
      'instances/Prominence/config/a.json'
    ])
    await fs.remove(dataDir)
  })

  it('deletes only previously tracked orphans outside immune folders', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-orphan-'))
    const trackedGone = path.join(dataDir, 'instances', 'Prominence', 'resourcepacks', 'old.zip')
    const untracked = path.join(dataDir, 'instances', 'Prominence', 'resourcepacks', 'mine.zip')
    const immune = path.join(dataDir, 'instances', 'Prominence', 'saves', 'world', 'level.dat')
    const userMod = path.join(dataDir, 'instances', 'Prominence', 'mods', 'user.jar')
    await fs.outputFile(trackedGone, 'old')
    await fs.outputFile(untracked, 'mine')
    await fs.outputFile(immune, 'save')
    await fs.outputFile(userMod, 'mod')

    expect(isFullyImmunePath('saves/world/level.dat')).toBe(true)
    expect(isUserModsPath('mods/user.jar')).toBe(true)
    expect(canDeleteOrphanTrackedPath('resourcepacks/old.zip')).toBe(true)
    expect(canDeleteOrphanTrackedPath('mods/user.jar')).toBe(false)
    expect(instanceRelativePath('instances/Prominence/resourcepacks/old.zip', 'Prominence')).toBe(
      'resourcepacks/old.zip'
    )
    expect(shouldSkipRemoteModule('instances/Prominence/mods/pack.jar', 'Prominence')).toBe(true)
    expect(shouldSkipRemoteModule('instances/Prominence/logs/a.log', 'Prominence')).toBe(true)

    const removed = await removeOrphanTrackedFiles({
      dataDirectory: dataDir,
      serverId: 'Prominence',
      previousTrackedPaths: [
        'instances/Prominence/resourcepacks/old.zip',
        'instances/Prominence/saves/world/level.dat',
        'instances/Prominence/mods/user.jar'
      ],
      currentTrackedPaths: new Set()
    })

    expect(removed).toBe(1)
    expect(await fs.pathExists(trackedGone)).toBe(false)
    expect(await fs.pathExists(untracked)).toBe(true)
    expect(await fs.pathExists(immune)).toBe(true)
    expect(await fs.pathExists(userMod)).toBe(true)

    await fs.remove(dataDir)
  })

  it('collects Helios-style module paths', () => {
    const dataDir = '/data'
    const server = {
      modules: [
        {
          getPath: () => '/data/common/mods/fabric/a.jar',
          rawModule: { type: 'FabricMod' },
          subModules: [
            {
              getPath: () => '/data/instances/Prominence/config/b.json',
              rawModule: { type: 'File' }
            }
          ]
        }
      ]
    }
    const mods = collectDistributionModules(server, dataDir)
    expect(mods.map((m) => m.relativePath).sort()).toEqual([
      'common/mods/fabric/a.jar',
      'instances/Prominence/config/b.json'
    ])
  })
})

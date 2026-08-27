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
  restorePreservedFiles,
  vacatePreservedFiles
} from '../../src/main/services/download/preserveBackup'
import {
  assertDistributionDoesNotOwnUserMods,
  collectDistributionModules,
  instanceRelativePath,
  migrateLegacyPackMods,
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
  elybyTexturesUrl,
  elybyUsernameProfileUrl,
  elybyNumericProfileUrl,
  upgradeElybyAssetUrl,
  elybyProfileUrl,
  undashUuid,
  parseElyAccountId,
  shortUuid
} from '../../src/shared/elybyProfile'
import { buildLinuxDesktopEntry, quoteDesktopExec } from '../../src/shared/linuxDesktop'
import {
  linuxReleaseArtifactName,
  macReleaseArtifactName,
  windowsReleaseArtifactName
} from '../../src/shared/releaseArtifacts'

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
    // Pack metadata: expected loader/mod set must follow distribution updates.
    expect(isPlayerMutablePath('config/crash_assistant/modlist.json')).toBe(false)
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
    expect(elybyTexturesUrl('Steve')).toBe('https://skinsystem.ely.by/textures/Steve')
    expect(elybyUsernameProfileUrl('ErickSkrauch')).toBe('https://ely.by/ErickSkrauch')
    expect(elybyNumericProfileUrl(3575339)).toBe('https://ely.by/u3575339')
    expect(upgradeElybyAssetUrl('http://ely.by/storage/skins/abc.png')).toBe(
      'https://ely.by/storage/skins/abc.png'
    )
    expect(elybyProfileUrl({ username: 'XanderWP', displayName: 'XanderWP', elyId: 3575339 })).toBe(
      'https://ely.by/u3575339'
    )
    expect(elybyProfileUrl({ username: 'XanderWP', displayName: 'XanderWP' })).toBe(
      'https://account.ely.by/'
    )
  })

  it('builds undashed uuids', () => {
    expect(undashUuid('ffc8fdc9-5824-509e-8a57-c99b940fb996')).toBe(
      'ffc8fdc95824509e8a57c99b940fb996'
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

describe('linuxDesktop helpers', () => {
  it('quotes Exec paths with spaces', () => {
    expect(quoteDesktopExec('/opt/AwesomeCraft.AppImage')).toBe('/opt/AwesomeCraft.AppImage')
    expect(quoteDesktopExec('/home/user/My Apps/AwesomeCraft.AppImage')).toBe(
      '"/home/user/My Apps/AwesomeCraft.AppImage"'
    )
  })

  it('builds a FreeDesktop entry with icon and exec', () => {
    const entry = buildLinuxDesktopEntry({
      name: 'AwesomeCraft Launcher',
      comment: 'Minecraft launcher',
      execPath: '/home/user/AwesomeCraftLauncher.AppImage',
      iconPath: '/home/user/.local/share/icons/hicolor/256x256/apps/ru.awesomecraft.launcher.png'
    })
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Type=Application')
    expect(entry).toContain('Exec=/home/user/AwesomeCraftLauncher.AppImage %U')
    expect(entry).toContain(
      'Icon=/home/user/.local/share/icons/hicolor/256x256/apps/ru.awesomecraft.launcher.png'
    )
    expect(entry).toContain('Categories=Game;')
    expect(entry).toContain('StartupWMClass=AwesomeCraftLauncher')
    expect(entry).toContain('MimeType=x-scheme-handler/awesomelauncher;')
  })
})

describe('releaseArtifacts', () => {
  it('uses stable AwesomeLauncher names without version or setup', () => {
    expect(windowsReleaseArtifactName()).toBe('AwesomeLauncher.exe')
    expect(linuxReleaseArtifactName()).toBe('AwesomeLauncher.AppImage')
    expect(macReleaseArtifactName('arm64')).toBe('AwesomeLauncher-arm64.dmg')
    expect(macReleaseArtifactName('x64', 'zip')).toBe('AwesomeLauncher-x64.zip')
  })
})

describe('modMetadata', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')
  const AdmZip = require('adm-zip')
  const {
    disabledModPath,
    enabledModPath,
    isDisabledModFile,
    isModArchiveFile,
    listModFilesInDirectory,
    parseModsToml,
    readModMetadataFromJar
  } = require('../../src/main/services/mods/modMetadata')

  it('detects jar and disabled suffixes', () => {
    expect(isModArchiveFile('foo.jar')).toBe(true)
    expect(isModArchiveFile('foo.jar.disabled')).toBe(true)
    expect(isModArchiveFile('foo.txt')).toBe(false)
    expect(isDisabledModFile('foo.jar.disabled')).toBe(true)
    expect(isDisabledModFile('foo.jar')).toBe(false)
    expect(enabledModPath('/a/foo.jar.disabled')).toBe('/a/foo.jar')
    expect(disabledModPath('/a/foo.jar')).toBe('/a/foo.jar.disabled')
  })

  it('parses mods.toml fields', () => {
    const parsed = parseModsToml(`
modLoader="javafml"
[[mods]]
modId="example"
version="1.2.3"
displayName="Example Mod"
description="A short desc"
authors="Alice, Bob"
logoFile="logo.png"
displayURL="https://example.com/mod"
`)
    expect(parsed).toEqual({
      id: 'example',
      name: 'Example Mod',
      version: '1.2.3',
      description: 'A short desc',
      authors: ['Alice', 'Bob'],
      logoFile: 'logo.png',
      homepage: 'https://example.com/mod'
    })
  })

  it('reads fabric.mod.json from a jar', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mod-'))
    const jarPath = path.join(dir, 'demo.jar')
    const zip = new AdmZip()
    zip.addFile(
      'fabric.mod.json',
      Buffer.from(
        JSON.stringify({
          id: 'demo',
          name: 'Demo Mod',
          version: '9.9.9',
          description: 'Hello',
          authors: ['Xander'],
          icon: 'icon.png',
          contact: {
            homepage: 'https://modrinth.com/mod/demo',
            sources: 'https://github.com/demo/mod'
          }
        }),
        'utf8'
      )
    )
    // 1x1 PNG
    zip.addFile(
      'icon.png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    )
    zip.writeZip(jarPath)

    const meta = readModMetadataFromJar(jarPath)
    expect(meta.id).toBe('demo')
    expect(meta.name).toBe('Demo Mod')
    expect(meta.version).toBe('9.9.9')
    expect(meta.description).toBe('Hello')
    expect(meta.authors).toEqual(['Xander'])
    expect(meta.homepage).toBe('https://modrinth.com/mod/demo')
    expect(meta.iconDataUrl).toMatch(/^data:image\/png;base64,/)

    await fs.outputFile(path.join(dir, 'other.jar.disabled'), 'x')
    const listed = await listModFilesInDirectory(dir)
    expect(listed.map((p: string) => path.basename(p)).sort()).toEqual([
      'demo.jar',
      'other.jar.disabled'
    ])

    await fs.remove(dir)
  })
})

describe('ModsService install', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')
  const AdmZip = require('adm-zip')
  const { ModsService } = require('../../src/main/services/mods/ModsService')
  const modMetadata = require('../../src/main/services/mods/modMetadata')

  function writeFabricJar(
    jarPath: string,
    meta: { id: string; name: string; version: string }
  ): void {
    const zip = new AdmZip()
    zip.addFile(
      'fabric.mod.json',
      Buffer.from(
        JSON.stringify({
          id: meta.id,
          name: meta.name,
          version: meta.version,
          description: 'Nice',
          authors: ['Dev'],
          contact: { homepage: 'https://example.com/cool' }
        }),
        'utf8'
      )
    )
    zip.writeZip(jarPath)
  }

  it('previews and installs a jar into instance mods', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mods-svc-'))
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mod-src-'))
    const jarPath = path.join(sourceDir, 'coolmod.jar')
    writeFabricJar(jarPath, { id: 'coolmod', name: 'Cool Mod', version: '2.0.0' })

    const service = new ModsService(
      { getDataDirectory: () => dataDir },
      { get: async () => ({ raw: { servers: [] } }) }
    )

    const preview = await service.previewMod(jarPath)
    expect(preview.name).toBe('Cool Mod')
    expect(preview.homepage).toBe('https://example.com/cool')

    const installed = await service.installUserMod('srv1', jarPath)
    expect(installed.fileName).toBe('coolmod.jar')
    expect(installed.source).toBe('user')
    expect(await fs.pathExists(installed.filePath)).toBe(true)

    await expect(service.installUserMod('srv1', jarPath)).rejects.toThrow(/already exists/i)

    await fs.remove(dataDir)
    await fs.remove(sourceDir)
  })

  it('reuses cached listMods payload when files are unchanged', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mods-cache-'))
    const modsDir = path.join(dataDir, 'instances', 'srv1', 'mods')
    await fs.ensureDir(modsDir)
    const jarPath = path.join(modsDir, 'cached.jar')
    writeFabricJar(jarPath, { id: 'cached', name: 'Cached Mod', version: '1.0.0' })

    const distro = { get: async () => ({ raw: { servers: [] } }) }
    const service = new ModsService({ getDataDirectory: () => dataDir }, distro)

    const spy = jest.spyOn(modMetadata, 'readModMetadataFromJar')
    const first = await service.listMods('srv1')
    expect(spy).toHaveBeenCalled()
    const readsAfterFirst = spy.mock.calls.length
    expect(first.userMods).toHaveLength(1)
    expect(first.userMods[0].name).toBe('Cached Mod')

    const second = await service.listMods('srv1')
    expect(spy.mock.calls.length).toBe(readsAfterFirst)
    expect(second).toBe(first)

    await service.deleteUserMod('srv1', first.userMods[0].filePath)
    const third = await service.listMods('srv1')
    expect(third.userMods).toHaveLength(0)
    expect(third).not.toBe(first)

    spy.mockRestore()
    await fs.remove(dataDir)
  })

  it('reuses disk listMods cache after service restart', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mods-disk-'))
    const modsDir = path.join(dataDir, 'instances', 'srv1', 'mods')
    await fs.ensureDir(modsDir)
    writeFabricJar(path.join(modsDir, 'cached.jar'), {
      id: 'cached',
      name: 'Cached Mod',
      version: '1.0.0'
    })

    const distro = { get: async () => ({ raw: { servers: [] } }) }
    const firstService = new ModsService({ getDataDirectory: () => dataDir }, distro)
    const first = await firstService.listMods('srv1')
    expect(first.userMods).toHaveLength(1)

    const spy = jest.spyOn(modMetadata, 'readModMetadataFromJar')
    const secondService = new ModsService({ getDataDirectory: () => dataDir }, distro)
    const second = await secondService.listMods('srv1')
    expect(spy).not.toHaveBeenCalled()
    expect(second.userMods[0].name).toBe('Cached Mod')
    expect(second).toEqual(first)

    spy.mockRestore()
    await fs.remove(dataDir)
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
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['config/demo.json', 'options.txt'])

    await vacatePreservedFiles(entries)
    expect(await fs.pathExists(path.join(root, 'options.txt'))).toBe(false)
    expect(await fs.pathExists(path.join(root, 'config', 'demo.json'))).toBe(false)
    expect(await fs.pathExists(path.join(root, 'mods', 'demo.jar'))).toBe(true)

    const restored = await restorePreservedFiles(entries)
    expect(restored).toBe(2)
    expect(await fs.readFile(path.join(root, 'options.txt'), 'utf8')).toBe('lang:en_us')
    expect(await fs.readFile(path.join(root, 'config', 'demo.json'), 'utf8')).toBe('{"a":1}')
    expect(await fs.readFile(path.join(root, 'mods', 'demo.jar'), 'utf8')).toBe('jar')

    expect(await fs.readFile(path.join(root, 'logs', 'latest.log'), 'utf8')).toBe('log')
    expect(await fs.readFile(path.join(root, 'saves', 'world', 'level.dat'), 'utf8')).toBe('save')
    expect(await fs.readFile(path.join(root, 'resourcepacks', 'pack.zip'), 'utf8')).toBe('pack')

    await fs.remove(root)
  })

  it('skips config and never walks user mods when preserve is disabled', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-test-'))
    await fs.outputFile(path.join(root, 'options.txt'), 'x')
    await fs.outputFile(path.join(root, 'config', 'a.json'), 'c')
    await fs.outputFile(path.join(root, 'mods', 'u.jar'), 'm')
    const entries = await backupPreservedFiles(root, false)
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['options.txt'])
    await fs.remove(root)
  })
})

describe('serverFileIndex + orphan sync', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')

  it('rejects a distribution that resolves a module into user mods', () => {
    const dataDir = path.resolve('/data')
    const server = {
      modules: [
        {
          getPath: () => path.join(dataDir, 'instances', 'srv', 'mods', 'pack.jar'),
          rawModule: { type: 'File' },
          subModules: []
        }
      ]
    }
    expect(() => assertDistributionDoesNotOwnUserMods(server, dataDir, 'srv')).toThrow(/user-owned/)
  })

  it('moves hash-matching legacy NeoForge pack mods out of instance mods', async () => {
    const crypto = require('crypto')
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-mod-migration-'))
    const legacy = path.join(dataDir, 'instances', 'srv', 'mods', 'pack.jar')
    const target = path.join(
      dataDir,
      'common',
      'mods',
      'neoforge',
      'generated',
      'pack',
      '1',
      'pack-1.jar'
    )
    const user = path.join(dataDir, 'instances', 'srv', 'mods', 'user.jar')
    await fs.outputFile(legacy, 'pack')
    await fs.outputFile(user, 'user')
    const hash = crypto.createHash('md5').update('pack').digest('hex')
    const server = {
      modules: [
        {
          rawModule: {
            type: 'NeoForgeMod',
            artifact: { MD5: hash, url: 'https://example.test/neoforgemods/required/pack.jar' }
          },
          getPath: () => target,
          subModules: []
        }
      ]
    }

    expect(await migrateLegacyPackMods(server, dataDir, 'srv')).toBe(1)
    expect(await fs.pathExists(legacy)).toBe(false)
    expect(await fs.readFile(target, 'utf8')).toBe('pack')
    expect(await fs.readFile(user, 'utf8')).toBe('user')
    await fs.remove(dataDir)
  })

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

  it('removes an orphaned managed NeoForge mod without deleting ordinary user mods', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-managed-orphan-'))
    const managed = path.join(dataDir, 'instances', 'Prominence', 'mods', 'old-pack.jar')
    const user = path.join(dataDir, 'instances', 'Prominence', 'mods', 'player.jar')
    await fs.outputFile(managed, 'pack')
    await fs.outputFile(user, 'player')

    const removed = await removeOrphanTrackedFiles({
      dataDirectory: dataDir,
      serverId: 'Prominence',
      previousTrackedPaths: ['instances/Prominence/mods/old-pack.jar'],
      currentTrackedPaths: new Set(),
      allowManagedMods: true
    })

    expect(removed).toBe(1)
    expect(await fs.pathExists(managed)).toBe(false)
    expect(await fs.pathExists(user)).toBe(true)
    await fs.remove(dataDir)
  })

  it('does not delete a common mod still referenced by another server', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-shared-mod-'))
    const shared = path.join(dataDir, 'common', 'mods', 'neoforge', 'shared.jar')
    await fs.outputFile(shared, 'pack')

    const removed = await removeOrphanTrackedFiles({
      dataDirectory: dataDir,
      serverId: 'old-server',
      previousTrackedPaths: ['common/mods/neoforge/shared.jar'],
      currentTrackedPaths: new Set(),
      globallyReferencedPaths: new Set(['common/mods/neoforge/shared.jar'])
    })

    expect(removed).toBe(0)
    expect(await fs.pathExists(shared)).toBe(true)
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

describe('NeoForge central locator', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')
  const {
    injectLocatorJvmArguments,
    locatorGeneration,
    safeManifestDirectory,
    writeNeoForgeModManifest
  } = require('../../src/main/services/launch/neoforgeLocator')

  it('selects the matching FML API generation', () => {
    expect(locatorGeneration('1.20.1')).toBe('legacy-1.20.1')
    expect(locatorGeneration('1.20.4')).toBe('legacy-1.20.1')
    expect(locatorGeneration('1.20.5')).toBe('modern-1.20.5')
    expect(locatorGeneration('1.21.1')).toBe('modern-1.20.5')
  })

  it('writes only selected central NeoForge modules', async () => {
    const commonDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-locator-'))
    const centralJar = path.join(commonDir, 'mods', 'neoforge', 'g', 'a', '1', 'a-1.jar')
    await fs.outputFile(centralJar, 'jar')
    const result = writeNeoForgeModManifest(commonDir, '../unsafe server', [
      {
        rawModule: { type: 'NeoForgeMod' },
        getPath: () => centralJar
      },
      {
        rawModule: { type: 'ForgeMod' },
        getPath: () => path.join(commonDir, 'mods', 'forge', 'ignored.jar')
      }
    ])

    expect(result.entries).toEqual([path.resolve(centralJar)])
    expect(await fs.readFile(result.manifestPath, 'utf8')).toContain(path.resolve(centralJar))
    expect(path.basename(path.dirname(result.manifestPath))).toBe(
      safeManifestDirectory('../unsafe server')
    )
    await fs.remove(commonDir)
  })

  it('adds the locator to module path and passes the manifest properties', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-locator-args-'))
    const locator = path.join(root, 'locator.jar')
    await fs.outputFile(locator, 'jar')
    const args = injectLocatorJvmArguments(
      ['-p', 'loader.jar'],
      locator,
      path.join(root, 'mods.list'),
      path.join(root, 'mods')
    )
    expect(args[1]).toContain(locator)
    expect(args).toContain(`-Dawesomecraft.neoforge.modManifest=${path.join(root, 'mods.list')}`)
    expect(args).toContain(`-Dawesomecraft.neoforge.modRoot=${path.join(root, 'mods')}`)
    await fs.remove(root)
  })
})

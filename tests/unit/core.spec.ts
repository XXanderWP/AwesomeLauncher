import {
  isPlayerMutablePath,
  shouldPreserveExistingFile,
  normalizeGameRelativePath
} from '../../src/shared/preservePaths'
import { resolveLanguage, isSupportedLanguage } from '../../src/shared/i18nResolve'
import { parseHostPort, clamp, formatBytes } from '../../src/main/utils/paths'
import {
  normalizeProfileUuid,
  createClientToken,
  accountFromAuthResponse
} from '../../src/main/services/auth/elybyAuth'
import {
  backupPreservedFiles,
  restorePreservedFiles
} from '../../src/main/services/download/preserveBackup'
import { validateRamLimits, clampRamMb } from '../../src/shared/ramValidation'
import {
  elybySkinUrl,
  elybyProfileUrl,
  parseElyAccountId,
  shortUuid
} from '../../src/shared/elybyProfile'
import { buildLinuxDesktopEntry, quoteDesktopExec } from '../../src/shared/linuxDesktop'

describe('preservePaths', () => {
  it('normalizes separators', () => {
    expect(normalizeGameRelativePath('.\\config\\foo.json')).toBe('config/foo.json')
  })

  it('marks player configs as mutable', () => {
    expect(isPlayerMutablePath('options.txt')).toBe(true)
    expect(isPlayerMutablePath('servers.dat')).toBe(true)
    expect(isPlayerMutablePath('config/sodium-options.json')).toBe(true)
    expect(isPlayerMutablePath('XaeroWaypoints/a.txt')).toBe(true)
  })

  it('does not treat mods/jars as mutable', () => {
    expect(isPlayerMutablePath('mods/example.jar')).toBe(false)
    expect(isPlayerMutablePath('resourcepacks/pack.zip')).toBe(false)
  })

  it('force-verifies yosbr defaults', () => {
    expect(isPlayerMutablePath('config/yosbr/options.txt')).toBe(false)
  })

  it('preserves only when enabled and file exists', () => {
    expect(shouldPreserveExistingFile('options.txt', true, true)).toBe(true)
    expect(shouldPreserveExistingFile('options.txt', false, true)).toBe(false)
    expect(shouldPreserveExistingFile('options.txt', true, false)).toBe(false)
    expect(shouldPreserveExistingFile('mods/a.jar', true, true)).toBe(false)
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
  })
})

describe('preserveBackup', () => {
  const fs = require('fs-extra')
  const os = require('os')
  const path = require('path')

  it('backs up and restores mutable files only', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-test-'))
    await fs.outputFile(path.join(root, 'options.txt'), 'lang:en_us')
    await fs.outputFile(path.join(root, 'config', 'demo.json'), '{"a":1}')
    await fs.outputFile(path.join(root, 'mods', 'demo.jar'), 'jar')

    const entries = await backupPreservedFiles(root, true)
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['config/demo.json', 'options.txt'])

    await fs.writeFile(path.join(root, 'options.txt'), 'OVERWRITTEN')
    await fs.writeFile(path.join(root, 'config', 'demo.json'), 'OVERWRITTEN')
    await fs.writeFile(path.join(root, 'mods', 'demo.jar'), 'OVERWRITTEN')

    const restored = await restorePreservedFiles(entries)
    expect(restored).toBe(2)
    expect(await fs.readFile(path.join(root, 'options.txt'), 'utf8')).toBe('lang:en_us')
    expect(await fs.readFile(path.join(root, 'config', 'demo.json'), 'utf8')).toBe('{"a":1}')
    expect(await fs.readFile(path.join(root, 'mods', 'demo.jar'), 'utf8')).toBe('OVERWRITTEN')

    await fs.remove(root)
  })

  it('skips backup when disabled', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-test-'))
    await fs.outputFile(path.join(root, 'options.txt'), 'x')
    expect(await backupPreservedFiles(root, false)).toEqual([])
    await fs.remove(root)
  })
})

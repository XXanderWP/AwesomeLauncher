import { createRequire } from 'node:module'
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import os from 'os'
import { join, resolve as resolvePath } from 'path'
import { ConfigService } from './services/config/ConfigService'
import { DistroService } from './services/distro/DistroService'
import { InstallService } from './services/download/InstallService'
import { ModsService } from './services/mods/ModsService'
import { XaeroMapService } from './services/xaero/XaeroMapService'
import { GameService } from './services/game/GameService'
import { UpdaterService } from './services/updater/UpdaterService'
import { DiscordPresenceService } from './services/discord/DiscordPresenceService'
import {
  authenticate,
  accountFromAuthResponse,
  refresh,
  invalidate
} from './services/auth/elybyAuth'
import {
  pollDeviceCodeLogin,
  startDeviceCodeLogin,
  enrichAccountWithElyId,
  ensurePlayableSession
} from './services/auth/elybyDeviceCode'
import { fetchElybySkinDataUrl } from './services/auth/elybySkinFetch'
import { resolveElybyPublicProfile } from './services/auth/elybyPublicProfile'
import { fetchServerStatus } from './services/server-status/serverStatus'
import { fetchOnlinePlayers } from './services/server-status/onlinePlayers'
import {
  getLinuxShortcutStatus,
  installLinuxDesktopShortcut,
  removeLinuxDesktopShortcut
} from './services/desktop/linuxDesktopShortcut'
import { IPC } from '../shared/types'
import type { AppConfig, UpdateMode } from '../shared/types'
import { bytesToMb } from '../shared/ramValidation'
import { instanceDirectory } from './utils/paths'
import { PROTOCOL_SCHEME, findProtocolUrlInArgv, parseLaunchProtocolUrl } from '../shared/protocol'

// Strip Cursor / foreign AppImage LD_LIBRARY_PATH from the host before any spawn.
// Runtime file lives in out/launch/ (copied by copy-launch-assets), next to out/main/.
const requireLaunch = createRequire(__filename)
const { sanitizeLauncherProcessEnv } = requireLaunch(join(__dirname, '../launch/launchEnv.js')) as {
  sanitizeLauncherProcessEnv: () => { changed: boolean; ldLibraryPath: string | null }
}
const hostEnvSanitized = sanitizeLauncherProcessEnv()
if (hostEnvSanitized.changed) {
  console.log(
    `[Launcher] Sanitized host LD_LIBRARY_PATH=${hostEnvSanitized.ldLibraryPath || '(cleared)'}`
  )
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function registerProtocolClient(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        resolvePath(process.argv[1])
      ])
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
  }
}

let mainWindow: BrowserWindow | null = null
let configService: ConfigService
let distroService: DistroService
let installService: InstallService
let modsService: ModsService
let xaeroMapService: XaeroMapService
let gameService: GameService
let updaterService: UpdaterService
let discordPresence: DiscordPresenceService
let activeDeviceCode: string | null = null
let servicesReady = false
let pendingProtocolUrl: string | null = findProtocolUrlInArgv(process.argv)

function focusMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function handleProtocolUrl(rawUrl: string): Promise<void> {
  const parsed = parseLaunchProtocolUrl(rawUrl)
  if (!parsed) {
    console.log(`[Protocol] Ignored URL: ${rawUrl}`)
    return
  }

  focusMainWindow()

  if (!servicesReady || !gameService || !configService) {
    pendingProtocolUrl = rawUrl
    console.log(`[Protocol] Queued launch for server ${parsed.serverId}`)
    return
  }

  if (gameService.getState().running) {
    console.log(`[Protocol] Game already running; focusing launcher (${parsed.serverId})`)
    return
  }

  try {
    await configService.update({ selectedServerId: parsed.serverId })
    console.log(`[Protocol] Launching server ${parsed.serverId}`)
    await gameService.launch(parsed.serverId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Protocol] Launch failed: ${message}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'AwesomeCraft Launcher',
        message: 'Could not launch from Discord join link',
        detail: message
      })
    }
  }
}

async function flushPendingProtocolUrl(): Promise<void> {
  if (!pendingProtocolUrl) return
  const url = pendingProtocolUrl
  pendingProtocolUrl = null
  await handleProtocolUrl(url)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    // Show immediately with backgroundColor so AppImage cold-start is not a blank desktop.
    show: true,
    frame: false,
    backgroundColor: '#0f1218',
    title: 'AwesomeCraft Launcher',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  const sendMaximized = (): void => {
    mainWindow?.webContents.send(IPC.EVENT_WINDOW_MAXIMIZED, mainWindow.isMaximized())
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC.APP_PLATFORM, () => process.platform)
  ipcMain.handle(IPC.SYSTEM_LOCALE, () => app.getLocale())
  ipcMain.handle(IPC.SYSTEM_MEMORY, () => ({
    totalMb: bytesToMb(os.totalmem()),
    freeMb: bytesToMb(os.freemem())
  }))
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) URLs can be opened')
    }
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle(IPC.CONFIG_GET, () => configService.get())
  ipcMain.handle(IPC.CONFIG_UPDATE, async (_e, partial: Partial<AppConfig>) => {
    const next = await configService.update(partial as any)
    if (partial.settings?.launcher?.dataDirectory) {
      distroService.invalidate()
    }
    if (partial.settings?.launcher?.updateMode) {
      updaterService.applyUpdateMode(partial.settings.launcher.updateMode as UpdateMode)
    }
    if (partial.settings?.launcher && 'discordRichPresence' in partial.settings.launcher) {
      void discordPresence?.onConfigChanged()
    } else if (partial.settings?.launcher?.language !== undefined) {
      void discordPresence?.onConfigChanged()
    }
    return next
  })
  ipcMain.handle(IPC.CONFIG_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) {
      return configService.get()
    }
    return configService.update({
      settings: { launcher: { dataDirectory: result.filePaths[0] } }
    } as any)
  })

  ipcMain.handle(
    IPC.AUTH_LOGIN,
    async (_e, payload: { username: string; password: string; totp?: string }) => {
      const clientToken = configService.get().clientToken
      const result = await authenticate(
        payload.username,
        payload.password,
        clientToken,
        payload.totp
      )
      if (result.networkMessage) {
        throw new Error(`Network error: ${result.networkMessage}`)
      }
      if (result.statusCode !== 200 || !result.body || !('accessToken' in result.body)) {
        const errBody = result.body as { errorMessage?: string; error?: string } | null
        throw new Error(
          errBody?.errorMessage || errBody?.error || `Auth failed (${result.statusCode})`
        )
      }
      const account = accountFromAuthResponse(result.body as any)
      return configService.setAccount(account, true)
    }
  )

  ipcMain.handle(IPC.AUTH_DEVICE_START, async () => {
    const started = await startDeviceCodeLogin()
    activeDeviceCode = started.deviceCode
    return started
  })

  ipcMain.handle(IPC.AUTH_DEVICE_POLL, async () => {
    if (!activeDeviceCode) {
      return { status: 'expired' as const }
    }
    const result = await pollDeviceCodeLogin(activeDeviceCode)
    if (result.status === 'success') {
      activeDeviceCode = null
      const cfg = await configService.setAccount(result.account, true)
      return { ...result, config: cfg }
    }
    if (result.status === 'expired' || result.status === 'denied') {
      activeDeviceCode = null
    }
    return result
  })

  ipcMain.handle(IPC.AUTH_DEVICE_CANCEL, () => {
    activeDeviceCode = null
    return true
  })

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    const account = configService.getSelectedAccount()
    if (account) {
      await invalidate(account.accessToken, configService.get().clientToken)
      return configService.removeAccount(account.uuid)
    }
    return configService.get()
  })

  ipcMain.handle(IPC.AUTH_REFRESH, async () => {
    const account = configService.getSelectedAccount()
    if (!account) return configService.get()
    try {
      const next = await ensurePlayableSession(account, configService.get().clientToken)
      return configService.setAccount(next, true)
    } catch {
      const result = await refresh(account.accessToken, configService.get().clientToken)
      if (result.statusCode === 200 && result.body && 'accessToken' in result.body) {
        const next = accountFromAuthResponse(result.body as any)
        return configService.setAccount(next, true)
      }
      return configService.get()
    }
  })

  ipcMain.handle(IPC.ELYBY_FETCH_SKIN, async (_e, username: string) => {
    if (typeof username !== 'string' || !username.trim()) return null
    return fetchElybySkinDataUrl(username.trim())
  })

  ipcMain.handle(
    IPC.ELYBY_RESOLVE_PROFILE,
    async (_e, payload: { username?: string; uuid?: string }) => {
      return resolveElybyPublicProfile({
        username: typeof payload?.username === 'string' ? payload.username : undefined,
        uuid: typeof payload?.uuid === 'string' ? payload.uuid : undefined
      })
    }
  )

  ipcMain.handle(IPC.DISTRO_GET, async () => distroService.get())
  ipcMain.handle(IPC.DISTRO_REFRESH, async () => distroService.refresh())

  ipcMain.handle(IPC.SERVER_STATUS, async (_e, payload: { host: string; port?: number }) => {
    return fetchServerStatus(payload.host, payload.port ?? 25565)
  })

  ipcMain.handle(
    IPC.SERVER_ONLINE_PLAYERS,
    async (_e, payload: { host: string; statusPort?: number }) => {
      return fetchOnlinePlayers(payload.host, payload.statusPort)
    }
  )

  ipcMain.handle(IPC.INSTALL_VERIFY, async (_e, serverId: string) => {
    return installService.verifyAndRepair(serverId)
  })

  ipcMain.handle(IPC.INSTALL_LAUNCH, async (_e, serverId: string) => {
    await configService.update({ selectedServerId: serverId })
    return gameService.launch(serverId)
  })

  ipcMain.handle(IPC.INSTANCE_OPEN, async (_e, serverId: string) => {
    const dir = instanceDirectory(configService.getDataDirectory(), serverId)
    await fs.ensureDir(dir)
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
    return true
  })

  ipcMain.handle(IPC.INSTANCE_DELETE, async (_e, serverId: string) => {
    if (gameService.getState().running) {
      throw new Error('Stop the game before deleting an instance')
    }
    const dir = instanceDirectory(configService.getDataDirectory(), serverId)
    if (await fs.pathExists(dir)) {
      await fs.remove(dir)
    }
    await configService.clearJavaOverride(serverId)
    return true
  })

  ipcMain.handle(IPC.XAERO_MAP_HAS, async (_e, payload: { serverId: string; host: string }) => {
    return xaeroMapService.hasMap(payload.serverId, payload.host)
  })
  ipcMain.handle(IPC.XAERO_MAP_RENDER, async (_e, payload: { serverId: string; host: string }) => {
    return xaeroMapService.renderMap(payload.serverId, payload.host)
  })

  ipcMain.handle(IPC.MODS_LIST, async (_e, serverId: string) => {
    return modsService.listMods(serverId)
  })
  ipcMain.handle(
    IPC.MODS_SET_ENABLED,
    async (_e, payload: { serverId: string; filePath: string; enabled: boolean }) => {
      if (gameService.getState().running) {
        throw new Error('Stop the game before changing mods')
      }
      return modsService.setUserModEnabled(payload.serverId, payload.filePath, payload.enabled)
    }
  )
  ipcMain.handle(IPC.MODS_DELETE, async (_e, payload: { serverId: string; filePath: string }) => {
    if (gameService.getState().running) {
      throw new Error('Stop the game before deleting mods')
    }
    return modsService.deleteUserMod(payload.serverId, payload.filePath)
  })
  ipcMain.handle(IPC.MODS_PREVIEW, async (_e, sourcePath: string) => {
    return modsService.previewMod(sourcePath)
  })
  ipcMain.handle(
    IPC.MODS_INSTALL,
    async (_e, payload: { serverId: string; sourcePath: string }) => {
      if (gameService.getState().running) {
        throw new Error('Stop the game before installing mods')
      }
      return modsService.installUserMod(payload.serverId, payload.sourcePath)
    }
  )

  ipcMain.handle(IPC.GAME_STATE, () => gameService.getState())
  ipcMain.handle(IPC.GAME_LOGS, () => gameService.getLogs())
  ipcMain.handle(IPC.GAME_KILL, () => gameService.kill())
  ipcMain.handle(IPC.GAME_CLEAR_LOGS, () => {
    gameService.clearLogs()
    return true
  })
  ipcMain.handle(IPC.GAME_EXPORT_LOGS, async () => {
    const stamp = new Date()
    const stampFile = stamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Minecraft logs',
      defaultPath: `AwesomeLauncher-logs-${stampFile}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) {
      return { saved: false as const }
    }

    const config = configService.get()
    const account = configService.getSelectedAccount()
    const gameState = gameService.getState()
    const logs = gameService.getLogs()
    const lines = [
      'AwesomeCraft Launcher — Minecraft logs export',
      `Exported: ${stamp.toISOString()}`,
      `Launcher version: ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `OS: ${os.type()} ${os.release()}`,
      `Locale: ${app.getLocale()}`,
      `Memory: ${bytesToMb(os.totalmem())} MB total / ${bytesToMb(os.freemem())} MB free`,
      `Data directory: ${config.settings.launcher.dataDirectory}`,
      `Selected server: ${config.selectedServerId || '(none)'}`,
      `Account: ${account?.username || '(none)'} (${account?.uuid || 'n/a'})`,
      `Game running: ${gameState.running ? 'yes' : 'no'}`,
      `Game PID: ${gameState.pid ?? 'n/a'}`,
      `Game startedAt: ${gameState.startedAt ? new Date(gameState.startedAt).toISOString() : 'n/a'}`,
      `Game exitCode: ${gameState.exitCode ?? 'n/a'}`,
      '',
      `----- logs (${logs.length} lines) -----`,
      ...logs.map((line) => {
        const time = new Date(line.timestamp).toISOString()
        return `[${time}] [${line.stream}] ${line.text}`
      })
    ]

    await fs.writeFile(result.filePath, `${lines.join('\n')}\n`, 'utf8')
    return { saved: true as const, path: result.filePath }
  })

  ipcMain.handle(IPC.UPDATE_STATUS, () => updaterService.getStatus())
  ipcMain.handle(IPC.UPDATE_CHECK, () => updaterService.check())
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, () => updaterService.download())
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    updaterService.install()
    return true
  })

  ipcMain.handle(IPC.DESKTOP_SHORTCUT_STATUS, () => getLinuxShortcutStatus())
  ipcMain.handle(IPC.DESKTOP_SHORTCUT_INSTALL, () => installLinuxDesktopShortcut())
  ipcMain.handle(IPC.DESKTOP_SHORTCUT_REMOVE, () => removeLinuxDesktopShortcut())

  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize()
    return true
  })
  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => {
    mainWindow?.close()
    return true
  })
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => Boolean(mainWindow?.isMaximized()))
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return

  Menu.setApplicationMenu(null)
  registerProtocolClient()

  configService = new ConfigService()
  await configService.load()

  distroService = new DistroService(configService)
  installService = new InstallService(configService, distroService)
  modsService = new ModsService(configService, distroService)
  xaeroMapService = new XaeroMapService(() => configService.getDataDirectory())
  gameService = new GameService(configService, distroService, installService)
  updaterService = new UpdaterService(configService)
  discordPresence = new DiscordPresenceService(configService, distroService, gameService)

  registerIpc()
  createWindow()
  updaterService.init()
  discordPresence.start()
  servicesReady = true
  void flushPendingProtocolUrl()

  // Enrich elyId in the background — never block first paint on network.
  const selected = configService.getSelectedAccount()
  if (selected) {
    void enrichAccountWithElyId(selected)
      .then(async (enriched) => {
        if (enriched.elyId !== selected.elyId) {
          await configService.setAccount(enriched, true)
        }
      })
      .catch(() => {
        /* offline / expired token — profile link stays on account.ely.by */
      })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', (_event, argv) => {
  const url = findProtocolUrlInArgv(argv)
  focusMainWindow()
  if (url) {
    void handleProtocolUrl(url)
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (servicesReady) {
    void handleProtocolUrl(url)
  } else {
    pendingProtocolUrl = url
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (gameService?.getState().running) {
    gameService.kill()
  }
  void discordPresence?.stop()
})

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import os from 'os'
import { join } from 'path'
import { ConfigService } from './services/config/ConfigService'
import { DistroService } from './services/distro/DistroService'
import { InstallService } from './services/download/InstallService'
import { ModsService } from './services/mods/ModsService'
import { GameService } from './services/game/GameService'
import { UpdaterService } from './services/updater/UpdaterService'
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
import { fetchServerStatus } from './services/server-status/serverStatus'
import {
  getLinuxShortcutStatus,
  installLinuxDesktopShortcut,
  removeLinuxDesktopShortcut
} from './services/desktop/linuxDesktopShortcut'
import { IPC } from '../shared/types'
import type { AppConfig, UpdateMode } from '../shared/types'
import { bytesToMb } from '../shared/ramValidation'
import { instanceDirectory } from './utils/paths'

let mainWindow: BrowserWindow | null = null
let configService: ConfigService
let distroService: DistroService
let installService: InstallService
let modsService: ModsService
let gameService: GameService
let updaterService: UpdaterService
let activeDeviceCode: string | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    show: false,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

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

  ipcMain.handle(IPC.DISTRO_GET, async () => distroService.get())
  ipcMain.handle(IPC.DISTRO_REFRESH, async () => distroService.refresh())

  ipcMain.handle(IPC.SERVER_STATUS, async (_e, payload: { host: string; port?: number }) => {
    return fetchServerStatus(payload.host, payload.port ?? 25565)
  })

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

  ipcMain.handle(IPC.GAME_STATE, () => gameService.getState())
  ipcMain.handle(IPC.GAME_LOGS, () => gameService.getLogs())
  ipcMain.handle(IPC.GAME_KILL, () => gameService.kill())
  ipcMain.handle(IPC.GAME_CLEAR_LOGS, () => {
    gameService.clearLogs()
    return true
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
}

app.whenReady().then(async () => {
  configService = new ConfigService()
  await configService.load()

  const selected = configService.getSelectedAccount()
  if (selected) {
    const enriched = await enrichAccountWithElyId(selected)
    if (enriched.elyId !== selected.elyId) {
      await configService.setAccount(enriched, true)
    }
  }

  distroService = new DistroService(configService)
  installService = new InstallService(configService, distroService)
  modsService = new ModsService(configService, distroService)
  gameService = new GameService(configService, distroService, installService)
  updaterService = new UpdaterService(configService)

  registerIpc()
  createWindow()
  updaterService.init()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
})

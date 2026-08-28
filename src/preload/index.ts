import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppConfig,
  DistroServerSummary,
  GameLogLine,
  GameProcessState,
  LegacyDataOffer,
  LocalInstanceInfo,
  ModInfo,
  ModPreview,
  ElybyPublicProfile,
  OnlinePlayersResult,
  ProgressEvent,
  ServerModsPayload,
  ServerOnlineStatus,
  UpdateStatus
} from '../shared/types'

export interface DeviceCodeStartPayload {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type DevicePollPayload =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'expired' }
  | { status: 'denied'; message: string }
  | { status: 'success'; account: unknown; refreshToken?: string; config: AppConfig }

export interface DesktopShortcutStatus {
  supported: boolean
  installed: boolean
  desktopPath: string
  iconPath: string
  execPath: string
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke(IPC.APP_PLATFORM),
  getSystemLocale: (): Promise<string> => ipcRenderer.invoke(IPC.SYSTEM_LOCALE),
  getSystemMemory: (): Promise<{ totalMb: number; freeMb: number }> =>
    ipcRenderer.invoke(IPC.SYSTEM_MEMORY),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
  updateConfig: (partial: DeepPartial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_UPDATE, partial),
  selectDataDirectory: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_SELECT_DIR),
  getLegacyDataOffer: (): Promise<LegacyDataOffer> => ipcRenderer.invoke(IPC.LEGACY_DATA_OFFER),
  acceptLegacyDataDirectory: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.LEGACY_DATA_ACCEPT),
  declineLegacyDataDirectory: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.LEGACY_DATA_DECLINE),

  login: (username: string, password: string, totp?: string): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.AUTH_LOGIN, { username, password, totp }),
  startDeviceLogin: (): Promise<DeviceCodeStartPayload> =>
    ipcRenderer.invoke(IPC.AUTH_DEVICE_START),
  pollDeviceLogin: (): Promise<DevicePollPayload> => ipcRenderer.invoke(IPC.AUTH_DEVICE_POLL),
  cancelDeviceLogin: (): Promise<boolean> => ipcRenderer.invoke(IPC.AUTH_DEVICE_CANCEL),
  logout: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  refreshAuth: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.AUTH_REFRESH),

  getDistro: (): Promise<{ servers: DistroServerSummary[] }> => ipcRenderer.invoke(IPC.DISTRO_GET),
  refreshDistro: (): Promise<{ servers: DistroServerSummary[] }> =>
    ipcRenderer.invoke(IPC.DISTRO_REFRESH),

  getServerStatus: (host: string, port?: number): Promise<ServerOnlineStatus> =>
    ipcRenderer.invoke(IPC.SERVER_STATUS, { host, port }),
  getOnlinePlayers: (host: string, statusPort?: number): Promise<OnlinePlayersResult> =>
    ipcRenderer.invoke(IPC.SERVER_ONLINE_PLAYERS, { host, statusPort }),

  verifyInstall: (
    serverId: string
  ): Promise<{ invalidFileCount: number; restoredConfigs: number }> =>
    ipcRenderer.invoke(IPC.INSTALL_VERIFY, serverId),
  launch: (serverId: string): Promise<GameProcessState> =>
    ipcRenderer.invoke(IPC.INSTALL_LAUNCH, serverId),
  openInstanceFolder: (serverId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.INSTANCE_OPEN, serverId),
  deleteInstance: (serverId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.INSTANCE_DELETE, serverId),
  listInstances: (): Promise<LocalInstanceInfo[]> => ipcRenderer.invoke(IPC.INSTANCE_LIST),
  hasXaeroMap: (
    serverId: string,
    host: string
  ): Promise<{ available: boolean; host: string; mapDir: string | null }> =>
    ipcRenderer.invoke(IPC.XAERO_MAP_HAS, { serverId, host }),
  renderXaeroMap: (
    serverId: string,
    host: string
  ): Promise<{
    available: boolean
    host: string
    dataUrl: string | null
    width: number
    height: number
    regionCount: number
    originBlockX: number
    originBlockZ: number
    blocksPerPixel: number
    waypoints: Array<{
      name: string
      initials: string
      x: number
      y: number
      z: number
      color: string
      kind: 'normal' | 'death'
    }>
    logoutPosition: {
      x: number
      y: number
      z: number
      source: string
      label: string
    } | null
    error?: string
  }> => ipcRenderer.invoke(IPC.XAERO_MAP_RENDER, { serverId, host }),
  lookupXaeroBlock: (
    serverId: string,
    host: string,
    blockX: number,
    blockZ: number
  ): Promise<{
    blockId: string
    displayName: string
    biomeId: string | null
    height: number
  } | null> => ipcRenderer.invoke(IPC.XAERO_MAP_LOOKUP_BLOCK, { serverId, host, blockX, blockZ }),

  listMods: (serverId: string): Promise<ServerModsPayload> =>
    ipcRenderer.invoke(IPC.MODS_LIST, serverId),
  setModEnabled: (serverId: string, filePath: string, enabled: boolean): Promise<ModInfo> =>
    ipcRenderer.invoke(IPC.MODS_SET_ENABLED, { serverId, filePath, enabled }),
  deleteMod: (serverId: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.MODS_DELETE, { serverId, filePath }),
  previewMod: (sourcePath: string): Promise<ModPreview> =>
    ipcRenderer.invoke(IPC.MODS_PREVIEW, sourcePath),
  installMod: (serverId: string, sourcePath: string): Promise<ModInfo> =>
    ipcRenderer.invoke(IPC.MODS_INSTALL, { serverId, sourcePath }),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  getGameState: (): Promise<GameProcessState> => ipcRenderer.invoke(IPC.GAME_STATE),
  getGameLogs: (): Promise<GameLogLine[]> => ipcRenderer.invoke(IPC.GAME_LOGS),
  killGame: (): Promise<GameProcessState> => ipcRenderer.invoke(IPC.GAME_KILL),
  clearGameLogs: (): Promise<boolean> => ipcRenderer.invoke(IPC.GAME_CLEAR_LOGS),
  exportGameLogs: (): Promise<{ saved: false } | { saved: true; path: string }> =>
    ipcRenderer.invoke(IPC.GAME_EXPORT_LOGS),
  fetchElybySkin: (username: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.ELYBY_FETCH_SKIN, username),
  resolveElybyProfile: (payload: {
    username?: string
    uuid?: string
  }): Promise<ElybyPublicProfile> => ipcRenderer.invoke(IPC.ELYBY_RESOLVE_PROFILE, payload),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_STATUS),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),

  getDesktopShortcutStatus: (): Promise<DesktopShortcutStatus> =>
    ipcRenderer.invoke(IPC.DESKTOP_SHORTCUT_STATUS),
  installDesktopShortcut: (): Promise<DesktopShortcutStatus> =>
    ipcRenderer.invoke(IPC.DESKTOP_SHORTCUT_INSTALL),
  removeDesktopShortcut: (): Promise<DesktopShortcutStatus> =>
    ipcRenderer.invoke(IPC.DESKTOP_SHORTCUT_REMOVE),

  windowMinimize: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
  windowClose: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
    ipcRenderer.on(IPC.EVENT_WINDOW_MAXIMIZED, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT_WINDOW_MAXIMIZED, listener)
  },

  onProgress: (cb: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: ProgressEvent): void => cb(payload)
    ipcRenderer.on(IPC.EVENT_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT_PROGRESS, listener)
  },
  onGameLog: (cb: (line: GameLogLine) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: GameLogLine): void => cb(payload)
    ipcRenderer.on(IPC.EVENT_GAME_LOG, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT_GAME_LOG, listener)
  },
  onGameState: (cb: (state: GameProcessState) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: GameProcessState): void => cb(payload)
    ipcRenderer.on(IPC.EVENT_GAME_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT_GAME_STATE, listener)
  },
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: UpdateStatus): void => cb(payload)
    ipcRenderer.on(IPC.EVENT_UPDATE_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.EVENT_UPDATE_STATUS, listener)
  }
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

contextBridge.exposeInMainWorld('awesomeAPI', api)

export type AwesomeAPI = typeof api

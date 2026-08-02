import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppConfig,
  DistroServerSummary,
  GameLogLine,
  GameProcessState,
  ProgressEvent,
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

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke(IPC.APP_PLATFORM),
  getSystemLocale: (): Promise<string> => ipcRenderer.invoke(IPC.SYSTEM_LOCALE),
  getSystemMemory: (): Promise<{ totalMb: number; freeMb: number }> =>
    ipcRenderer.invoke(IPC.SYSTEM_MEMORY),

  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
  updateConfig: (partial: DeepPartial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_UPDATE, partial),
  selectDataDirectory: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_SELECT_DIR),

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

  getGameState: (): Promise<GameProcessState> => ipcRenderer.invoke(IPC.GAME_STATE),
  getGameLogs: (): Promise<GameLogLine[]> => ipcRenderer.invoke(IPC.GAME_LOGS),
  killGame: (): Promise<GameProcessState> => ipcRenderer.invoke(IPC.GAME_KILL),
  clearGameLogs: (): Promise<boolean> => ipcRenderer.invoke(IPC.GAME_CLEAR_LOGS),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_STATUS),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),

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

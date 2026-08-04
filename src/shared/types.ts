export type SupportedLanguage = 'en' | 'ru' | 'uk'
export type LanguageSetting = 'system' | SupportedLanguage

export type UpdateMode = 'auto-install-on-quit' | 'auto-download-manual-install'

export interface ElybyAccount {
  type: 'elyby'
  accessToken: string
  username: string
  uuid: string
  displayName: string
  /** Numeric Ely.by site account id used in https://ely.by/u{id}. */
  elyId?: number
  /**
   * OAuth refresh token from device-code login (`offline_access` scope).
   * Used to renew `accessToken` before launch; not present for password/Yggdrasil logins.
   */
  refreshToken?: string
}

export interface GameSettings {
  resWidth: number
  resHeight: number
  fullscreen: boolean
  autoConnect: boolean
  launchDetached: boolean
}

export interface JavaServerSettings {
  minRamMb: number
  maxRamMb: number
  javaPath: string | null
  jvmOptions: string[]
}

export interface LauncherSettings {
  dataDirectory: string
  language: LanguageSetting
  updateMode: UpdateMode
  allowPrerelease: boolean
  preservePlayerConfigs: boolean
  /** Skip random loading GIFs and the extra splash delay. */
  skipLoadingGifs: boolean
  /** Disable backdrop blur on main UI panels. */
  disableUiBlur: boolean
  /** Show Discord Rich Presence while the launcher/game is running. */
  discordRichPresence: boolean
}

export interface AppConfig {
  version: number
  clientToken: string
  selectedServerId: string | null
  selectedAccountUuid: string | null
  accounts: Record<string, ElybyAccount>
  settings: {
    game: GameSettings
    launcher: LauncherSettings
  }
  /** Shared Java defaults; per-server overrides live in javaByServer. */
  javaDefaults: JavaServerSettings
  javaByServer: Record<string, JavaServerSettings>
  /**
   * Last known live server names from status MOTD, keyed by distro server id.
   * Used when the game server is offline.
   */
  cachedServerNames: Record<string, string>
}

export interface DistroServerSummary {
  id: string
  name: string
  description: string
  icon: string
  version: string
  address: string
  port: number
  minecraftVersion: string
  mainServer: boolean
  autoconnect: boolean
  java: {
    supported: string
    suggestedMajor: number
    ram: {
      minimum: number
      recommended: number
    }
  }
}

export interface ServerOnlineStatus {
  online: boolean
  playersOnline: number
  playersMax: number
  versionName: string | null
  /** Plain-text MOTD / live server name from status ping. */
  description: string | null
  latencyMs: number | null
  error?: string
}

/** Player entry from awesome_minecraft_status GET /online (port 1313). */
export interface OnlinePlayer {
  uuid: string
  name: string
  playtimeTicks: number
  playtimeSeconds: number
  playtimeFormatted: string
  /**
   * Seconds since last JOIN (status mod ≥1.1).
   * `null` when the field is absent (old mod) or not tracked yet.
   */
  sessionSeconds: number | null
  sessionFormatted: string | null
}

/** Offline player from `offline_players` (status mod ≥1.1; no session fields). */
export interface OfflinePlayer {
  uuid: string
  name: string
  playtimeTicks: number
  playtimeSeconds: number
  playtimeFormatted: string
}

export interface OnlinePlayersResult {
  ok: boolean
  online: number
  max: number
  /** Offline count from API; `0` when the mod does not send it. */
  offline: number
  players: OnlinePlayer[]
  offlinePlayers: OfflinePlayer[]
  /** True when response included `offline` / `offline_players` (mod ≥1.1). */
  supportsOfflineList: boolean
  error?: string
}

/** Resolved Ely.by public profile for an online player (nick and/or UUID lookup). */
export interface ElybyPublicProfile {
  found: boolean
  username: string | null
  uuid: string | null
  /** Numeric Ely.by site account id for https://ely.by/u{elyId}. */
  elyId: number | null
  /** https://ely.by/u{elyId} when the numeric site id is known. */
  profileUrl: string | null
}

export interface ProgressEvent {
  phase: 'validate' | 'download' | 'java' | 'launch' | 'idle'
  percent: number
  message: string
  detail?: string
}

export interface GameLogLine {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  timestamp: number
}

export interface GameProcessState {
  running: boolean
  pid: number | null
  startedAt: number | null
  exitCode: number | null
  /** Distro server id of the running instance, when `running` is true. */
  serverId: string | null
}

export interface UpdateInfoPayload {
  version: string
  releaseDate?: string
  releaseName?: string
}

export interface UpdateStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  progress: number
  info: UpdateInfoPayload | null
  error: string | null
}

export type ModSource = 'user' | 'common'

export interface ModInfo {
  id: string
  fileName: string
  filePath: string
  source: ModSource
  enabled: boolean
  name: string
  version: string
  description: string | null
  authors: string[]
  iconDataUrl: string | null
  homepage: string | null
}

export interface ModPreview {
  sourcePath: string
  fileName: string
  id: string
  name: string
  version: string
  description: string | null
  authors: string[]
  iconDataUrl: string | null
  homepage: string | null
}

export interface ServerModsPayload {
  serverId: string
  userMods: ModInfo[]
  commonMods: ModInfo[]
}

export const DISTRO_URL = 'https://files.awesome-craft.ru/launcher/distribution.json'
export const NEWS_RSS_URL = 'https://files.awesome-craft.ru/launcher/news.rss'
export const ELYBY_AUTH_URL = 'https://authserver.ely.by'
export const ELYBY_SKIN_URL = 'https://skinsystem.ely.by/skins'
export const ELYBY_TEXTURES_URL = 'https://skinsystem.ely.by/textures'
export const ELYBY_REGISTER_URL = 'https://account.ely.by/register'
export const ELYBY_OAUTH_TOKEN_URL = 'https://account.ely.by/api/oauth2/v1/token'
export const ELYBY_OAUTH_DEVICE_URL = 'https://account.ely.by/api/oauth2/v1/devicecode'
export const ELYBY_ACCOUNT_INFO_URL = 'https://account.ely.by/api/account/v1/info'
export const ELYBY_DEVICE_VERIFY_URL = 'https://account.ely.by/code'
/** Default public Ely.by OAuth client id (community launchers). */
export const ELYBY_OAUTH_CLIENT_ID = 'ely'
export const DEFAULT_DATA_DIR_NAME = '.awesomelauncher'

export const IPC = {
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_SELECT_DIR: 'config:select-directory',
  AUTH_LOGIN: 'auth:login',
  AUTH_DEVICE_START: 'auth:device-start',
  AUTH_DEVICE_POLL: 'auth:device-poll',
  AUTH_DEVICE_CANCEL: 'auth:device-cancel',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_REFRESH: 'auth:refresh',
  DISTRO_GET: 'distro:get',
  DISTRO_REFRESH: 'distro:refresh',
  SERVER_STATUS: 'server:status',
  SERVER_ONLINE_PLAYERS: 'server:online-players',
  INSTALL_VERIFY: 'install:verify',
  INSTALL_LAUNCH: 'install:launch',
  INSTANCE_OPEN: 'instance:open',
  INSTANCE_DELETE: 'instance:delete',
  XAERO_MAP_HAS: 'xaero-map:has',
  XAERO_MAP_RENDER: 'xaero-map:render',
  XAERO_MAP_LOOKUP_BLOCK: 'xaero-map:lookup-block',
  MODS_LIST: 'mods:list',
  MODS_SET_ENABLED: 'mods:set-enabled',
  MODS_DELETE: 'mods:delete',
  MODS_PREVIEW: 'mods:preview',
  MODS_INSTALL: 'mods:install',
  GAME_STATE: 'game:state',
  GAME_LOGS: 'game:logs',
  GAME_KILL: 'game:kill',
  GAME_CLEAR_LOGS: 'game:clear-logs',
  GAME_EXPORT_LOGS: 'game:export-logs',
  ELYBY_FETCH_SKIN: 'elyby:fetch-skin',
  ELYBY_RESOLVE_PROFILE: 'elyby:resolve-profile',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  EVENT_WINDOW_MAXIMIZED: 'event:window-maximized',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  APP_VERSION: 'app:version',
  APP_PLATFORM: 'app:platform',
  SYSTEM_LOCALE: 'system:locale',
  SYSTEM_MEMORY: 'system:memory',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  DESKTOP_SHORTCUT_STATUS: 'desktop:shortcut-status',
  DESKTOP_SHORTCUT_INSTALL: 'desktop:shortcut-install',
  DESKTOP_SHORTCUT_REMOVE: 'desktop:shortcut-remove',
  EVENT_PROGRESS: 'event:progress',
  EVENT_GAME_LOG: 'event:game-log',
  EVENT_GAME_STATE: 'event:game-state',
  EVENT_UPDATE_STATUS: 'event:update-status',
  EVENT_CONFIG: 'event:config'
} as const

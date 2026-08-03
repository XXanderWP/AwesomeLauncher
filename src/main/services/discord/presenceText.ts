import type { SupportedLanguage } from '../../../shared/types'

export type PresencePhase = 'launcher' | 'game' | 'server'

interface PresenceStrings {
  inLauncher: (version: string) => string
  inGame: string
  onServer: (nick: string) => string
  stateOnlinePlaytime: (online: number, playtime: string) => string
  stateOnline: (online: number) => string
  statePlaytime: (playtime: string) => string
  connectButton: string
  largeImageLauncher: string
  largeImageGame: (serverName: string) => string
}

const STRINGS: Record<SupportedLanguage, PresenceStrings> = {
  en: {
    inLauncher: (version) => `In the launcher · ${version}`,
    inGame: 'In game',
    onServer: (nick) => `On server · ${nick}`,
    stateOnlinePlaytime: (online, playtime) => `Online: ${online} · Playtime: ${playtime}`,
    stateOnline: (online) => `Online: ${online}`,
    statePlaytime: (playtime) => `Playtime: ${playtime}`,
    connectButton: 'Connect to server',
    largeImageLauncher: 'AwesomeCraft Launcher',
    largeImageGame: (serverName) => serverName
  },
  ru: {
    inLauncher: (version) => `В лаунчере · ${version}`,
    inGame: 'В игре',
    onServer: (nick) => `На сервере · ${nick}`,
    stateOnlinePlaytime: (online, playtime) => `Онлайн: ${online} · Время: ${playtime}`,
    stateOnline: (online) => `Онлайн: ${online}`,
    statePlaytime: (playtime) => `Время: ${playtime}`,
    connectButton: 'Подключиться к серверу',
    largeImageLauncher: 'AwesomeCraft Launcher',
    largeImageGame: (serverName) => serverName
  },
  uk: {
    inLauncher: (version) => `У лаунчері · ${version}`,
    inGame: 'У грі',
    onServer: (nick) => `На сервері · ${nick}`,
    stateOnlinePlaytime: (online, playtime) => `Онлайн: ${online} · Час: ${playtime}`,
    stateOnline: (online) => `Онлайн: ${online}`,
    statePlaytime: (playtime) => `Час: ${playtime}`,
    connectButton: 'Підключитися до сервера',
    largeImageLauncher: 'AwesomeCraft Launcher',
    largeImageGame: (serverName) => serverName
  }
}

export function getPresenceStrings(lang: SupportedLanguage): PresenceStrings {
  return STRINGS[lang] || STRINGS.en
}

/** Discord uploaded asset for the launcher icon. */
export const DISCORD_ASSET_MAIN = 'main'

/** Discord uploaded asset for the current (only) pack when URL icons fail. */
export const DISCORD_ASSET_PROMINENCE = 'prominence'

export function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase()
}

export function resolveLargeImageKey(options: {
  gameRunning: boolean
  serverIconUrl?: string | null
}): string {
  if (!options.gameRunning) {
    return DISCORD_ASSET_MAIN
  }
  const icon = options.serverIconUrl?.trim()
  if (icon && /^https:\/\//i.test(icon)) {
    return icon
  }
  return DISCORD_ASSET_PROMINENCE
}

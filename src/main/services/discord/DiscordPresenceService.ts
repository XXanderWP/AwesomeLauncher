import { app } from 'electron'
import rpc from 'discord-rpc'
import type { ConfigService } from '../config/ConfigService'
import type { DistroService } from '../distro/DistroService'
import type { GameService } from '../game/GameService'
import { fetchOnlinePlayers, formatPlaytime } from '../server-status/onlinePlayers'
import { fetchMinecraftPingStatus } from '../server-status/serverStatus'
import { resolveLanguage } from '../../../shared/i18nResolve'
import { buildDiscordJoinButtonUrl } from '../../../shared/protocol'
import { isJoinBridgeAvailable } from './joinBridge'
import { ensureLinuxIpcSocket, getPlatformImage } from './platformImage'
import {
  getPresenceStrings,
  normalizeUuid,
  resolveLargeImageKey,
  type PresencePhase
} from './presenceText'

const CLIENT_ID = '1533660095479812258'
const RECONNECT_MS = 30_000
const REFRESH_MS = 15_000
const RATE_LIMIT_FIRST_MS = 15_000

interface PresenceSnapshot {
  phase: PresencePhase
  details: string
  state?: string
  largeImageKey: string
  largeImageText: string
  startTimestamp: number
  buttonUrl?: string
  buttonLabel?: string
}

export class DiscordPresenceService {
  private client: rpc.Client | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private shutdownRequested = false
  private startedAt = Date.now()
  private readonly platformImage = getPlatformImage()
  private lastSnapshot: PresenceSnapshot | null = null
  private unsubGame: (() => void) | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService,
    private readonly game: GameService
  ) {}

  start(): void {
    this.unsubGame = this.game.onStateChange(() => {
      void this.refreshActivity()
    })

    if (this.isEnabled()) {
      setTimeout(() => this.initialize(), 1000)
    }
  }

  async onConfigChanged(): Promise<void> {
    if (!this.isEnabled()) {
      await this.shutdown()
      return
    }
    this.shutdownRequested = false
    if (!this.client) {
      this.initialize()
      return
    }
    await this.refreshActivity()
  }

  async stop(): Promise<void> {
    this.unsubGame?.()
    this.unsubGame = null
    await this.shutdown()
  }

  private isEnabled(): boolean {
    return this.config.get().settings.launcher.discordRichPresence !== false
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private scheduleReconnect(delayMs = RECONNECT_MS): void {
    if (this.reconnectTimer || !this.isEnabled() || this.shutdownRequested) return
    console.log(`[DiscordRPC] Reconnecting in ${delayMs / 1000}s...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.initialize()
    }, delayMs)
  }

  private async shutdown(): Promise<void> {
    this.shutdownRequested = true
    this.clearReconnectTimer()
    this.clearRefreshTimer()
    const active = this.client
    this.client = null
    this.lastSnapshot = null
    if (!active) return

    try {
      if (active.user) {
        await active.clearActivity()
      }
    } catch (error) {
      console.log('[DiscordRPC] Failed to clear Rich Presence:', error)
    }
    try {
      await active.destroy()
    } catch (error) {
      console.log('[DiscordRPC] Failed to destroy client:', error)
    }
    console.log('[DiscordRPC] Rich Presence disabled')
  }

  private initialize(): void {
    if (!this.isEnabled() || this.client) return

    this.shutdownRequested = false
    console.log('[DiscordRPC] Initializing...')
    ensureLinuxIpcSocket()

    const client = new rpc.Client({ transport: 'ipc' })
    this.client = client

    client.on('ready', () => {
      const user = client.user
      console.log(`[DiscordRPC] Connected as ${user?.username ?? '?'}`)
      void this.refreshActivity()
      this.clearRefreshTimer()
      setTimeout(() => void this.refreshActivity(), RATE_LIMIT_FIRST_MS)
      this.refreshTimer = setInterval(() => void this.refreshActivity(), REFRESH_MS)
    })

    client.on('disconnected' as never, () => {
      console.log('[DiscordRPC] Disconnected')
      this.clearRefreshTimer()
      this.client = null
      if (this.isEnabled() && !this.shutdownRequested) {
        this.scheduleReconnect()
      }
    })

    client.login({ clientId: CLIENT_ID }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.log('[DiscordRPC] Login failed:', message)
      this.client = null
      if (this.isEnabled() && !this.shutdownRequested) {
        this.scheduleReconnect()
      }
    })
  }

  private async buildSnapshot(): Promise<PresenceSnapshot> {
    const lang = resolveLanguage(this.config.getLanguageSetting(), app.getLocale())
    const strings = getPresenceStrings(lang)
    const gameState = this.game.getState()
    const account = this.config.getSelectedAccount()

    if (!gameState.running || !gameState.serverId) {
      return {
        phase: 'launcher',
        details: strings.inLauncher(app.getVersion()),
        largeImageKey: resolveLargeImageKey({ gameRunning: false }),
        largeImageText: strings.largeImageLauncher,
        startTimestamp: this.startedAt
      }
    }

    const serverId = gameState.serverId
    const summary = (await this.distro.get()).servers.find((s) => s.id === serverId)
    const serverName = this.config.get().cachedServerNames[serverId] || summary?.name || serverId
    const largeImageKey = resolveLargeImageKey({
      gameRunning: true,
      serverIconUrl: summary?.icon
    })
    const startTimestamp = gameState.startedAt || Date.now()

    let onServer = false
    let playtimeFormatted: string | null = null
    let playersOnline: number | null = null
    const nick = account?.displayName || account?.username || '?'

    if (summary?.address && account) {
      const online = await fetchOnlinePlayers(summary.address)
      if (online.ok) {
        playersOnline = online.online
        const wantUuid = normalizeUuid(account.uuid)
        const wantName = account.displayName.toLowerCase()
        const me = online.players.find(
          (p) => (p.uuid && normalizeUuid(p.uuid) === wantUuid) || p.name.toLowerCase() === wantName
        )
        if (me) {
          onServer = true
          playtimeFormatted = me.playtimeFormatted || formatPlaytime(me.playtimeSeconds)
        }
      }

      if (playersOnline === null) {
        const status = await fetchMinecraftPingStatus(summary.address, summary.port)
        if (status.online) {
          playersOnline = status.playersOnline
        }
      }
    }

    if (onServer) {
      let state: string | undefined
      if (playersOnline !== null && playtimeFormatted) {
        state = strings.stateOnlinePlaytime(playersOnline, playtimeFormatted)
      } else if (playersOnline !== null) {
        state = strings.stateOnline(playersOnline)
      } else if (playtimeFormatted) {
        state = strings.statePlaytime(playtimeFormatted)
      }

      const snapshot: PresenceSnapshot = {
        phase: 'server',
        details: strings.onServer(nick),
        state,
        largeImageKey,
        largeImageText: strings.largeImageGame(serverName),
        startTimestamp
      }

      if (await isJoinBridgeAvailable()) {
        snapshot.buttonLabel = strings.connectButton
        snapshot.buttonUrl = buildDiscordJoinButtonUrl(serverId)
      }

      return snapshot
    }

    return {
      phase: 'game',
      details: strings.inGame,
      state: serverName,
      largeImageKey,
      largeImageText: strings.largeImageGame(serverName),
      startTimestamp
    }
  }

  private async refreshActivity(): Promise<void> {
    if (!this.isEnabled() || !this.client?.user) return

    try {
      const snapshot = await this.buildSnapshot()
      this.lastSnapshot = snapshot
      this.applySnapshot(snapshot)
    } catch (error) {
      console.log('[DiscordRPC] Failed to refresh activity:', error)
    }
  }

  private applySnapshot(snapshot: PresenceSnapshot): void {
    if (!this.client?.user) return

    try {
      const activity: rpc.Presence = {
        details: snapshot.details,
        startTimestamp: snapshot.startTimestamp,
        largeImageKey: snapshot.largeImageKey,
        largeImageText: snapshot.largeImageText,
        smallImageKey: this.platformImage.key,
        smallImageText: this.platformImage.text,
        instance: false
      }

      if (snapshot.state) {
        activity.state = snapshot.state
      }

      if (snapshot.buttonUrl && snapshot.buttonLabel) {
        activity.buttons = [
          {
            label: snapshot.buttonLabel.slice(0, 32),
            url: snapshot.buttonUrl
          }
        ]
      }

      this.client.setActivity(activity)
    } catch (error) {
      console.log('[DiscordRPC] Failed to set Rich Presence:', error)
    }
  }

  /** Exposed for tests / debugging. */
  getLastSnapshot(): PresenceSnapshot | null {
    return this.lastSnapshot
  }
}

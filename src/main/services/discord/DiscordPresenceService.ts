import { app } from 'electron'
import path from 'path'
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
  ensureSdrpLogState,
  extractLatestProminencePresence,
  parseSdrpPresenceLogLine,
  type ProminencePresenceData
} from './prominencePresence'
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
/** Ignore stale Prominence RPC snapshots after the game has been quiet this long. */
const PROMINENCE_STALE_MS = 120_000

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
  private unsubLog: (() => void) | null = null
  private prominencePresence: ProminencePresenceData | null = null
  private sdrpLogStateEnsuredFor: string | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService,
    private readonly game: GameService
  ) {}

  start(): void {
    this.unsubGame = this.game.onStateChange((state) => {
      if (!state.running) {
        this.prominencePresence = null
        this.sdrpLogStateEnsuredFor = null
      } else if (state.serverId) {
        void this.ensureProminenceBridge(state.serverId)
      }
      void this.refreshActivity()
    })

    this.unsubLog = this.game.onLog((line) => {
      const parsed = parseSdrpPresenceLogLine(line.text)
      if (!parsed) return
      this.prominencePresence = parsed
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
    this.unsubLog?.()
    this.unsubLog = null
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
    this.prominencePresence = null
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

  private async ensureProminenceBridge(serverId: string): Promise<void> {
    if (this.sdrpLogStateEnsuredFor === serverId) return
    this.sdrpLogStateEnsuredFor = serverId

    const gameDir = path.join(this.config.getDataDirectory(), 'instances', serverId)
    try {
      const enabled = await ensureSdrpLogState(gameDir)
      if (enabled) {
        console.log('[DiscordRPC] Enabled SDRP logState for Prominence presence bridge')
      }
    } catch (error) {
      console.log('[DiscordRPC] Failed to enable SDRP logState:', error)
    }

    const fromLogs = extractLatestProminencePresence(this.game.getLogs())
    if (fromLogs) {
      this.prominencePresence = fromLogs
    }
  }

  private getFreshProminencePresence(): ProminencePresenceData | null {
    const data = this.prominencePresence
    if (!data) return null
    if (Date.now() - data.updatedAt > PROMINENCE_STALE_MS) return null
    return data
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
    void this.ensureProminenceBridge(serverId)

    const summary = (await this.distro.get()).servers.find((s) => s.id === serverId)
    const serverName = this.config.get().cachedServerNames[serverId] || summary?.name || serverId
    const largeImageKey = resolveLargeImageKey({
      gameRunning: true,
      serverIconUrl: summary?.icon
    })
    const startTimestamp = gameState.startedAt || Date.now()
    const prominence = this.getFreshProminencePresence()

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
      const snapshot: PresenceSnapshot = {
        phase: 'server',
        details: prominence?.location || strings.onServer(nick),
        largeImageKey,
        largeImageText: strings.largeImageGame(serverName),
        startTimestamp
      }

      if (prominence?.levels) {
        snapshot.state = prominence.levels
        if (prominence.location) {
          snapshot.details = prominence.location
        }
      } else {
        let state: string | undefined
        if (playersOnline !== null && playtimeFormatted) {
          state = strings.stateOnlinePlaytime(playersOnline, playtimeFormatted)
        } else if (playersOnline !== null) {
          state = strings.stateOnline(playersOnline)
        } else if (playtimeFormatted) {
          state = strings.statePlaytime(playtimeFormatted)
        }
        snapshot.state = state
      }

      if (await isJoinBridgeAvailable()) {
        snapshot.buttonLabel = strings.connectButton
        snapshot.buttonUrl = buildDiscordJoinButtonUrl(serverId)
      }

      return snapshot
    }

    if (prominence?.location || prominence?.levels) {
      return {
        phase: 'game',
        details: prominence.location || strings.inGame,
        state: prominence.levels || serverName,
        largeImageKey,
        largeImageText: strings.largeImageGame(serverName),
        startTimestamp
      }
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

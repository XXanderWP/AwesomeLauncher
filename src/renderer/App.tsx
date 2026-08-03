import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppConfig,
  DistroServerSummary,
  GameLogLine,
  GameProcessState,
  LanguageSetting,
  ModPreview,
  ProgressEvent,
  ServerOnlineStatus,
  UpdateStatus
} from '@shared/types'
import { resolveLanguage } from '@shared/i18nResolve'
import { ELYBY_REGISTER_URL } from '@shared/types'
import { resolveServerDisplayName } from '@shared/serverDisplayName'
import {
  OFFLINE_CONFIRM_DELAY_MS,
  shouldConfirmOffline
} from '@shared/serverStatusHysteresis'
import { getCurrentLanguage, setLanguage, t } from './i18n'
import logo from './assets/logo.png'
import { getRandomBackgroundUrl } from './lib/backgroundMedia'
import { getRandomLoadingMedia, LOADING_EXTRA_DELAY_MS, LOADING_FADE_MS } from './lib/gifMedia'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'
import { ModDropNoticeModal, ModInstallConfirmModal } from './components/ModDropModals'
import { TitleBar } from './components/TitleBar'

type View = 'home' | 'settings' | 'logs'

function isDroppableModFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.jar') || lower.endsWith('.zip')
}

function dragHasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

export function App(): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [servers, setServers] = useState<DistroServerSummary[]>([])
  const [statuses, setStatuses] = useState<Record<string, ServerOnlineStatus>>({})
  const [view, setView] = useState<View>('home')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState<ProgressEvent>({
    phase: 'idle',
    percent: 0,
    message: ''
  })
  const [gameState, setGameState] = useState<GameProcessState>({
    running: false,
    pid: null,
    startedAt: null,
    exitCode: null,
    serverId: null
  })
  const [logs, setLogs] = useState<GameLogLine[]>([])
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [settingsScrollTo, setSettingsScrollTo] = useState<'updates' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [langTick, setLangTick] = useState(0)
  const [totalMemoryMb, setTotalMemoryMb] = useState(8192)
  const [platform, setPlatform] = useState<string>('')
  const [modsServerId, setModsServerId] = useState<string | null>(null)
  const [modsReloadToken, setModsReloadToken] = useState(0)
  const [dropActive, setDropActive] = useState(false)
  const [dropNotice, setDropNotice] = useState<'open-mods' | 'game-running' | null>(null)
  const [pendingInstall, setPendingInstall] = useState<ModPreview[] | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [showSplash, setShowSplash] = useState(true)
  const [splashLeaving, setSplashLeaving] = useState(false)
  const [bootMedia] = useState(() => getRandomLoadingMedia())
  const [wallpaper] = useState(() => getRandomBackgroundUrl())
  const dragDepth = useRef(0)

  const shellStyle = wallpaper
    ? ({ ['--app-wallpaper' as string]: `url(${wallpaper})` } as React.CSSProperties)
    : undefined
  const bootReady = Boolean(ready && config)
  const skipLoadingGifs = config?.settings.launcher.skipLoadingGifs === true
  const disableUiBlur = config?.settings.launcher.disableUiBlur === true
  const splashMedia = !config || skipLoadingGifs ? null : bootMedia
  const noBlurClass = disableUiBlur ? ' app-shell--no-blur' : ''

  const account = useMemo(() => {
    if (!config?.selectedAccountUuid) return null
    return config.accounts[config.selectedAccountUuid] ?? null
  }, [config])

  const modsServer = servers.find((s) => s.id === modsServerId) || null
  const modsServerName = modsServer
    ? resolveServerDisplayName(
        modsServer.name,
        statuses[modsServer.id]?.description,
        config?.cachedServerNames[modsServer.id]
      )
    : ''

  useEffect(() => {
    if (view !== 'home') {
      setModsServerId(null)
    }
  }, [view])

  useEffect(() => {
    if (!bootReady || !config) return
    const delay = config.settings.launcher.skipLoadingGifs ? 0 : LOADING_EXTRA_DELAY_MS
    const hold = window.setTimeout(() => setSplashLeaving(true), delay)
    return () => window.clearTimeout(hold)
  }, [bootReady, config])

  useEffect(() => {
    if (!splashLeaving) return
    const done = window.setTimeout(() => setShowSplash(false), LOADING_FADE_MS)
    return () => window.clearTimeout(done)
  }, [splashLeaving])

  useEffect(() => {
    let cancelled = false
    async function boot(): Promise<void> {
      try {
        const [cfg, ver, locale, distro, gState, gLogs, uStatus, memory, plat] = await Promise.all([
          window.awesomeAPI.getConfig(),
          window.awesomeAPI.getVersion(),
          window.awesomeAPI.getSystemLocale(),
          window.awesomeAPI.refreshDistro().catch(() => window.awesomeAPI.getDistro()),
          window.awesomeAPI.getGameState(),
          window.awesomeAPI.getGameLogs(),
          window.awesomeAPI.getUpdateStatus(),
          window.awesomeAPI.getSystemMemory(),
          window.awesomeAPI.getPlatform()
        ])
        if (cancelled) return
        const lang = resolveLanguage(cfg.settings.launcher.language, locale)
        setLanguage(lang)
        setConfig(cfg)
        setVersion(ver)
        setServers(distro.servers)
        setGameState(gState)
        setLogs(gLogs)
        setUpdateStatus(uStatus)
        setTotalMemoryMb(memory.totalMb)
        setPlatform(plat)
        setLangTick((x) => x + 1)
        setReady(true)

        if (!cfg.selectedServerId && distro.servers.length > 0) {
          const main = distro.servers.find((s) => s.mainServer) || distro.servers[0]
          const next = await window.awesomeAPI.updateConfig({ selectedServerId: main.id })
          if (!cancelled) setConfig(next)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setReady(true)
        }
      }
    }
    void boot()

    const offProgress = window.awesomeAPI.onProgress(setProgress)
    const offLog = window.awesomeAPI.onGameLog((line) =>
      setLogs((prev) => [...prev.slice(-4999), line])
    )
    const offState = window.awesomeAPI.onGameState(setGameState)
    const offUpdate = window.awesomeAPI.onUpdateStatus(setUpdateStatus)

    return () => {
      cancelled = true
      offProgress()
      offLog()
      offState()
      offUpdate()
    }
  }, [])

  const configRef = useRef(config)
  configRef.current = config

  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  useEffect(() => {
    if (!servers.length) return
    let cancelled = false
    const offlineConfirmTimers = new Map<string, ReturnType<typeof setTimeout>>()

    function clearOfflineConfirm(serverId: string): void {
      const timer = offlineConfirmTimers.get(serverId)
      if (timer) {
        clearTimeout(timer)
        offlineConfirmTimers.delete(serverId)
      }
    }

    function applyStatusEntries(entries: ReadonlyArray<readonly [string, ServerOnlineStatus]>): void {
      setStatuses((prev) => {
        const next = { ...prev }
        for (const [serverId, status] of entries) {
          next[serverId] = status
        }
        return next
      })

      void (async () => {
        const current = configRef.current
        if (!current) return

        const cachedServerNames = { ...current.cachedServerNames }
        let changed = false
        for (const [serverId, status] of entries) {
          const liveName = status.online ? status.description?.trim() : ''
          if (liveName && cachedServerNames[serverId] !== liveName) {
            cachedServerNames[serverId] = liveName
            changed = true
          }
        }

        if (changed) {
          const updated = await window.awesomeAPI.updateConfig({ cachedServerNames })
          if (!cancelled) setConfig(updated)
        }
      })()
    }

    function scheduleOfflineConfirm(serverId: string, host: string, port: number): void {
      if (offlineConfirmTimers.has(serverId)) return

      offlineConfirmTimers.set(
        serverId,
        setTimeout(() => {
          offlineConfirmTimers.delete(serverId)
          void (async () => {
            const status = await window.awesomeAPI.getServerStatus(host, port)
            if (cancelled) return
            if (status.online) {
              applyStatusEntries([[serverId, status]])
              return
            }
            // Only flip to offline if UI still shows online (second offline probe).
            if (statusesRef.current[serverId]?.online) {
              applyStatusEntries([[serverId, status]])
            }
          })()
        }, OFFLINE_CONFIRM_DELAY_MS)
      )
    }

    async function refreshStatuses(): Promise<void> {
      const probes = await Promise.all(
        servers.map(async (server) => {
          const status = await window.awesomeAPI.getServerStatus(server.address, server.port)
          return { server, status } as const
        })
      )
      if (cancelled) return

      const applyNow: Array<readonly [string, ServerOnlineStatus]> = []
      for (const { server, status } of probes) {
        if (status.online) {
          clearOfflineConfirm(server.id)
          applyNow.push([server.id, status])
          continue
        }

        if (shouldConfirmOffline(statusesRef.current[server.id]?.online, status.online)) {
          scheduleOfflineConfirm(server.id, server.address, server.port)
          continue
        }

        clearOfflineConfirm(server.id)
        applyNow.push([server.id, status])
      }

      if (applyNow.length) applyStatusEntries(applyNow)
    }

    void refreshStatuses()
    const timer = setInterval(() => void refreshStatuses(), 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
      for (const pending of offlineConfirmTimers.values()) clearTimeout(pending)
      offlineConfirmTimers.clear()
    }
  }, [servers])

  async function applyLanguageFromConfig(next: AppConfig): Promise<void> {
    const locale = await window.awesomeAPI.getSystemLocale()
    setLanguage(resolveLanguage(next.settings.launcher.language, locale))
    setLangTick((x) => x + 1)
  }

  async function previewLanguage(language: LanguageSetting): Promise<void> {
    const locale = await window.awesomeAPI.getSystemLocale()
    setLanguage(resolveLanguage(language, locale))
    setLangTick((x) => x + 1)
  }

  function resetDropState(): void {
    dragDepth.current = 0
    setDropActive(false)
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>): void {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDropActive(true)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>): void {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropActive(false)
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    resetDropState()
    const files = Array.from(event.dataTransfer.files || []).filter((file) =>
      isDroppableModFileName(file.name)
    )
    if (files.length === 0) return

    if (!modsServerId) {
      setDropNotice('open-mods')
      return
    }
    if (gameState.running) {
      setDropNotice('game-running')
      return
    }

    try {
      const paths = files
        .map((file) => window.awesomeAPI.getPathForFile(file))
        .filter((filePath) => Boolean(filePath))
      if (paths.length === 0) {
        setError('Could not resolve dropped file path')
        return
      }
      const previews = await Promise.all(
        paths.map((filePath) => window.awesomeAPI.previewMod(filePath))
      )
      setInstallError(null)
      setPendingInstall(previews)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function confirmInstall(): Promise<void> {
    if (!pendingInstall || !modsServerId) return
    setInstallBusy(true)
    setInstallError(null)
    try {
      for (const mod of pendingInstall) {
        await window.awesomeAPI.installMod(modsServerId, mod.sourcePath)
      }
      setPendingInstall(null)
      setModsReloadToken((token) => token + 1)
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallBusy(false)
    }
  }

  const splashOverlay = showSplash ? (
    <div
      key="boot-splash"
      className={`boot-screen${splashLeaving ? ' boot-screen--leave' : ''}`}
      style={shellStyle}
      role="status"
      aria-live="polite"
      aria-hidden={splashLeaving}
    >
      <div className="boot-screen-inner">
        {splashMedia?.type === 'video' ? (
          <video
            className="boot-media"
            src={splashMedia.url}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
          />
        ) : splashMedia ? (
          <img className="boot-media" src={splashMedia.url} alt="" />
        ) : (
          <img className="boot-logo" src={logo} alt="AwesomeCraft" />
        )}
        <div className="boot-chrome">
          <div className="boot-spinner" aria-hidden="true" />
          <p className="boot-label">{t('common.loading')}</p>
        </div>
      </div>
    </div>
  ) : null

  const shellRevealClass =
    (splashLeaving || !showSplash ? ' app-shell--reveal' : ' app-shell--pre-reveal') + noBlurClass

  if (!bootReady || !config) {
    return (
      <div className="app-frame">
        <TitleBar />
        {splashOverlay}
      </div>
    )
  }

  if (!account) {
    return (
      <div className="app-frame">
        <TitleBar />
        <div className={`app-shell${shellRevealClass}`} style={shellStyle}>
          <header className="topbar">
            <div className="brand">
              <img src={logo} alt="AwesomeCraft" />
              <div className="brand-text">
                <strong>{t('app.name')}</strong>
                <span>{t('app.tagline')}</span>
              </div>
            </div>
          </header>
          <main className="content">
            <LoginPage
              onSuccess={async (next) => {
                setConfig(next)
                await applyLanguageFromConfig(next)
              }}
            />
          </main>
        </div>
        {splashOverlay}
      </div>
    )
  }

  void langTick
  void getCurrentLanguage

  return (
    <div className="app-frame">
      <TitleBar />
      <div
        className={`app-shell${shellRevealClass}`}
        style={shellStyle}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => void handleDrop(event)}
      >
        <header className="topbar">
          <div className="brand">
            <img src={logo} alt="AwesomeCraft" />
            <div className="brand-text">
              <strong>{t('app.name')}</strong>
              <span>{t('common.version', version)}</span>
            </div>
          </div>
          <nav className="nav">
            <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
              {t('nav.home')}
            </button>
            <button
              className={view === 'settings' ? 'active' : ''}
              onClick={() => {
                setSettingsScrollTo(null)
                setView('settings')
              }}
            >
              {t('nav.settings')}
            </button>
            <button className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}>
              {t('nav.logs')}
            </button>
          </nav>
        </header>
        <main className="content">
          {error && <div className="error-box">{error}</div>}
          {view === 'home' && (
            <HomePage
              config={config}
              account={account}
              servers={servers}
              statuses={statuses}
              progress={progress}
              gameState={gameState}
              totalMemoryMb={totalMemoryMb}
              modsServerId={modsServerId}
              modsReloadToken={modsReloadToken}
              onModsServerIdChange={setModsServerId}
              onSelectServer={async (serverId) => {
                const next = await window.awesomeAPI.updateConfig({ selectedServerId: serverId })
                setConfig(next)
              }}
              onLaunch={async (serverId) => {
                setError(null)
                try {
                  await window.awesomeAPI.launch(serverId)
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                }
              }}
              onVerify={async (serverId) => {
                setError(null)
                try {
                  await window.awesomeAPI.verifyInstall(serverId)
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                }
              }}
              onKill={async () => {
                await window.awesomeAPI.killGame()
              }}
              onLogout={async () => {
                const next = await window.awesomeAPI.logout()
                setConfig(next)
              }}
              onOpenLogs={() => setView('logs')}
              onOpenUpdateSettings={() => {
                setSettingsScrollTo('updates')
                setView('settings')
              }}
              onConfigChange={async (next) => setConfig(next)}
              updateStatus={updateStatus}
            />
          )}
          {view === 'settings' && (
            <SettingsPage
              config={config}
              updateStatus={updateStatus}
              totalMemoryMb={totalMemoryMb}
              platform={platform}
              scrollToSection={settingsScrollTo}
              onScrollHandled={() => setSettingsScrollTo(null)}
              onChange={async (partial) => {
                const next = await window.awesomeAPI.updateConfig(partial)
                setConfig(next)
                await applyLanguageFromConfig(next)
              }}
              onBrowseDataDir={async () => {
                const next = await window.awesomeAPI.selectDataDirectory()
                setConfig(next)
              }}
              onPreviewLanguage={previewLanguage}
            />
          )}
          {view === 'logs' && (
            <LogsPage
              logs={logs}
              running={gameState.running}
              onClear={async () => {
                await window.awesomeAPI.clearGameLogs()
                setLogs([])
              }}
              onBack={() => setView('home')}
              onKill={async () => {
                await window.awesomeAPI.killGame()
              }}
            />
          )}
        </main>

        {dropActive ? (
          <div className="mod-drop-overlay" aria-hidden>
            <div className="mod-drop-overlay-card">
              {modsServerId ? t('instance.mods.drop.overlay') : t('instance.mods.drop.openMods')}
            </div>
          </div>
        ) : null}

        {dropNotice ? (
          <ModDropNoticeModal kind={dropNotice} onClose={() => setDropNotice(null)} />
        ) : null}

        {pendingInstall && modsServerId ? (
          <ModInstallConfirmModal
            serverName={modsServerName}
            mods={pendingInstall}
            busy={installBusy}
            error={installError}
            onCancel={() => {
              if (installBusy) return
              setPendingInstall(null)
              setInstallError(null)
            }}
            onConfirm={() => void confirmInstall()}
          />
        ) : null}

        {/* Keep register URL referenced for tooling */}
        <span hidden>{ELYBY_REGISTER_URL}</span>
      </div>
      {splashOverlay}
    </div>
  )
}

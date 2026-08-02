import { useEffect, useMemo, useState } from 'react'
import type {
  AppConfig,
  DistroServerSummary,
  GameLogLine,
  GameProcessState,
  LanguageSetting,
  ProgressEvent,
  ServerOnlineStatus,
  UpdateStatus
} from '@shared/types'
import { resolveLanguage } from '@shared/i18nResolve'
import { ELYBY_REGISTER_URL } from '@shared/types'
import { getCurrentLanguage, setLanguage, t } from './i18n'
import logo from './assets/logo.png'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'

type View = 'home' | 'settings' | 'logs'

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
    exitCode: null
  })
  const [logs, setLogs] = useState<GameLogLine[]>([])
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [langTick, setLangTick] = useState(0)
  const [totalMemoryMb, setTotalMemoryMb] = useState(8192)

  const account = useMemo(() => {
    if (!config?.selectedAccountUuid) return null
    return config.accounts[config.selectedAccountUuid] ?? null
  }, [config])

  useEffect(() => {
    let cancelled = false
    async function boot(): Promise<void> {
      try {
        const [cfg, ver, locale, distro, gState, gLogs, uStatus, memory] = await Promise.all([
          window.awesomeAPI.getConfig(),
          window.awesomeAPI.getVersion(),
          window.awesomeAPI.getSystemLocale(),
          window.awesomeAPI.refreshDistro().catch(() => window.awesomeAPI.getDistro()),
          window.awesomeAPI.getGameState(),
          window.awesomeAPI.getGameLogs(),
          window.awesomeAPI.getUpdateStatus(),
          window.awesomeAPI.getSystemMemory()
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

  useEffect(() => {
    if (!servers.length) return
    let cancelled = false

    async function refreshStatuses(): Promise<void> {
      const entries = await Promise.all(
        servers.map(async (server) => {
          const status = await window.awesomeAPI.getServerStatus(server.address, server.port)
          return [server.id, status] as const
        })
      )
      if (!cancelled) {
        setStatuses(Object.fromEntries(entries))
      }
    }

    void refreshStatuses()
    const timer = setInterval(() => void refreshStatuses(), 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
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

  if (!ready || !config) {
    return (
      <div className="content">
        <div className="panel">{t('common.loading')}</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="app-shell">
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
    )
  }

  void langTick
  void getCurrentLanguage

  return (
    <div className="app-shell">
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
            onClick={() => setView('settings')}
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
            accountName={account.displayName}
            servers={servers}
            statuses={statuses}
            progress={progress}
            gameState={gameState}
            totalMemoryMb={totalMemoryMb}
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
            onConfigChange={async (next) => setConfig(next)}
          />
        )}
        {view === 'settings' && (
          <SettingsPage
            config={config}
            updateStatus={updateStatus}
            totalMemoryMb={totalMemoryMb}
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
      {/* Keep register URL referenced for tooling */}
      <span hidden>{ELYBY_REGISTER_URL}</span>
    </div>
  )
}

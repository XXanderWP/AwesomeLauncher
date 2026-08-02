import type {
  AppConfig,
  DistroServerSummary,
  GameProcessState,
  ProgressEvent,
  ServerOnlineStatus
} from '@shared/types'
import { t } from '../i18n'

interface Props {
  config: AppConfig
  accountName: string
  servers: DistroServerSummary[]
  statuses: Record<string, ServerOnlineStatus>
  progress: ProgressEvent
  gameState: GameProcessState
  onSelectServer: (serverId: string) => void | Promise<void>
  onLaunch: (serverId: string) => void | Promise<void>
  onVerify: (serverId: string) => void | Promise<void>
  onKill: () => void | Promise<void>
  onLogout: () => void | Promise<void>
  onOpenLogs: () => void
}

export function HomePage({
  config,
  accountName,
  servers,
  statuses,
  progress,
  gameState,
  onSelectServer,
  onLaunch,
  onVerify,
  onKill,
  onLogout,
  onOpenLogs
}: Props): React.JSX.Element {
  const selectedId = config.selectedServerId || servers[0]?.id
  const busy = progress.phase !== 'idle' && progress.phase !== 'launch'

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>{t('home.servers')}</h1>
          <p className="muted">
            {t('home.account')}: {accountName}
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn" onClick={() => void onLogout()}>
            {t('home.logout')}
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <p className="muted">{t('home.noServers')}</p>
      ) : (
        <div className="grid-servers">
          {servers.map((server) => {
            const status = statuses[server.id]
            const selected = server.id === selectedId
            return (
              <div
                key={server.id}
                className={`server-row${selected ? ' selected' : ''}`}
                onClick={() => void onSelectServer(server.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') void onSelectServer(server.id)
                }}
              >
                <img src={server.icon || ''} alt="" />
                <div className="server-meta">
                  <h3>{server.name}</h3>
                  <p>
                    {server.minecraftVersion} · v{server.version} · {server.address}
                  </p>
                  <div className="status-pill">
                    <span className={`dot ${status?.online ? 'on' : 'off'}`} />
                    {status?.online
                      ? `${t('home.online')} · ${t('home.players', status.playersOnline, status.playersMax)}`
                      : t('home.offline')}
                    {selected ? ` · ${t('home.selected')}` : ''}
                  </div>
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    className="btn primary"
                    disabled={busy || gameState.running || !selected}
                    onClick={(e) => {
                      e.stopPropagation()
                      void onLaunch(server.id)
                    }}
                  >
                    {t('home.play')}
                  </button>
                  <button
                    className="btn"
                    disabled={busy || gameState.running || !selected}
                    onClick={(e) => {
                      e.stopPropagation()
                      void onVerify(server.id)
                    }}
                  >
                    {t('home.verify')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(busy || progress.message) && (
        <div className="progress">
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="progress-label">
            {t('home.progress')}: {progress.message} ({progress.percent}%)
          </div>
        </div>
      )}

      {gameState.running && (
        <div className="actions">
          <span className="muted">{t('home.running')}</span>
          <button className="btn" onClick={onOpenLogs}>
            {t('nav.logs')}
          </button>
          <button className="btn danger" onClick={() => void onKill()}>
            {t('home.kill')}
          </button>
        </div>
      )}
    </div>
  )
}

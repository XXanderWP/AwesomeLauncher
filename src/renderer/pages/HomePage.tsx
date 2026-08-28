import { useEffect, useState } from 'react'
import type {
  AppConfig,
  DistroServerSummary,
  ElybyAccount,
  GameProcessState,
  ProgressEvent,
  ServerOnlineStatus,
  UpdateStatus
} from '@shared/types'
import { resolveServerDisplayName } from '@shared/serverDisplayName'
import { t } from '../i18n'
import { InstanceJavaModal } from '../components/InstanceJavaModal'
import { InstanceModsModal } from '../components/InstanceModsModal'
import { InstanceOnlineModal } from '../components/InstanceOnlineModal'
import { InstanceMapModal } from '../components/InstanceMapModal'
import { ElybyAccountCard } from '../components/ElybyAccountCard'

interface Props {
  config: AppConfig
  account: ElybyAccount
  servers: DistroServerSummary[]
  statuses: Record<string, ServerOnlineStatus>
  progress: ProgressEvent
  gameState: GameProcessState
  totalMemoryMb: number
  modsServerId: string | null
  modsReloadToken: number
  onModsServerIdChange: (serverId: string | null) => void
  onSelectServer: (serverId: string) => void | Promise<void>
  onLaunch: (serverId: string) => void | Promise<void>
  onVerify: (serverId: string) => void | Promise<void>
  onKill: () => void | Promise<void>
  onLogout: () => void | Promise<void>
  onOpenLogs: () => void
  onOpenUpdateSettings: () => void
  onConfigChange: (config: AppConfig) => void | Promise<void>
  onInstanceDeleted: (serverId: string) => void | Promise<void>
  updateStatus: UpdateStatus | null
}

export function HomePage({
  config,
  account,
  servers,
  statuses,
  progress,
  gameState,
  totalMemoryMb,
  modsServerId,
  modsReloadToken,
  onModsServerIdChange,
  onSelectServer,
  onLaunch,
  onVerify,
  onKill,
  onLogout,
  onOpenLogs,
  onOpenUpdateSettings,
  onConfigChange,
  onInstanceDeleted,
  updateStatus
}: Props): React.JSX.Element {
  const selectedId = config.selectedServerId || servers[0]?.id
  const busy = progress.phase !== 'idle' && progress.phase !== 'launch'
  const [javaServerId, setJavaServerId] = useState<string | null>(null)
  const [onlineServerId, setOnlineServerId] = useState<string | null>(null)
  const [mapServerId, setMapServerId] = useState<string | null>(null)
  const [mapAvailableByServer, setMapAvailableByServer] = useState<Record<string, boolean>>({})
  const javaServer = servers.find((s) => s.id === javaServerId) || null
  const modsServer = servers.find((s) => s.id === modsServerId) || null
  const onlineServer = servers.find((s) => s.id === onlineServerId) || null
  const mapServer = servers.find((s) => s.id === mapServerId) || null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<string, boolean> = {}
      await Promise.all(
        servers
          .filter((server) => !server.archive)
          .map(async (server) => {
            try {
              const result = await window.awesomeAPI.hasXaeroMap(server.id, server.address)
              next[server.id] = result.available
            } catch {
              next[server.id] = false
            }
          })
      )
      if (!cancelled) setMapAvailableByServer(next)
    })()
    return () => {
      cancelled = true
    }
  }, [servers])

  async function openFolder(serverId: string): Promise<void> {
    await window.awesomeAPI.openInstanceFolder(serverId)
  }

  async function deleteInstance(serverId: string, name: string): Promise<void> {
    const ok = window.confirm(t('instance.delete.confirm', name))
    if (!ok) return
    await window.awesomeAPI.deleteInstance(serverId)
    await onInstanceDeleted(serverId)
  }

  const updateVersion = updateStatus?.info?.version
  const updateBannerText = updateVersion
    ? t('home.updateAvailable.version', updateVersion)
    : t('home.updateAvailable')

  return (
    <div className="home-layout">
      {updateStatus?.available && (
        <button type="button" className="warn-box warning" onClick={onOpenUpdateSettings}>
          {updateBannerText}
        </button>
      )}

      <ElybyAccountCard account={account} onLogout={onLogout} />

      <div className="panel">
        <h1>{t('home.servers')}</h1>

        {servers.length === 0 ? (
          <p className="muted">{t('home.noServers')}</p>
        ) : (
          <div className="grid-servers">
            {servers.map((server) => {
              const status = statuses[server.id]
              const selected = server.id === selectedId
              const archived = server.archive === true
              const displayName = resolveServerDisplayName(
                server.name,
                status?.description,
                config.cachedServerNames[server.id]
              )
              return (
                <div
                  key={server.id}
                  className={`server-row${selected ? ' selected' : ''}${archived ? ' server-row--archived' : ''}`}
                  onClick={() => void onSelectServer(server.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') void onSelectServer(server.id)
                  }}
                >
                  {archived ? null : <img src={server.icon || ''} alt="" />}
                  <div className="server-meta">
                    <h3>{displayName}</h3>
                    {displayName !== server.name ? (
                      <p className="server-pack">{server.name}</p>
                    ) : null}
                    <p>
                      {[
                        server.minecraftVersion,
                        server.version ? `v${server.version}` : '',
                        server.address
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <div className="status-pill">
                      <span className={`dot ${status?.online ? 'on' : 'off'}`} />
                      {status?.online
                        ? `${t('home.online')} · ${t('home.players', status.playersOnline, status.playersMax)}`
                        : t('home.offline')}
                      {archived ? ` · ${t('instance.archived')}` : ''}
                      {selected ? ` · ${t('home.selected')}` : ''}
                      {config.javaByServer[server.id] ? ` · ${t('instance.java.overridden')}` : ''}
                    </div>
                  </div>
                  <div className="actions actions-compact" style={{ marginTop: 0 }}>
                    <button
                      className={`btn btn-sm ${archived ? 'warn' : 'primary'}`}
                      disabled={busy || gameState.running || !selected}
                      onClick={(e) => {
                        e.stopPropagation()
                        void onLaunch(server.id)
                      }}
                    >
                      {t('home.play')}
                    </button>
                    {mapAvailableByServer[server.id] ? (
                      <button
                        className="btn btn-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMapServerId(server.id)
                        }}
                      >
                        {t('instance.map')}
                      </button>
                    ) : null}
                    <button
                      className="btn btn-sm"
                      disabled={archived || busy || gameState.running || !selected}
                      onClick={(e) => {
                        e.stopPropagation()
                        void onVerify(server.id)
                      }}
                    >
                      {t('home.verify')}
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={archived}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOnlineServerId(server.id)
                      }}
                    >
                      {t('instance.online')}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        void openFolder(server.id)
                      }}
                    >
                      {t('instance.open')}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onModsServerIdChange(server.id)
                      }}
                    >
                      {t('instance.mods')}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setJavaServerId(server.id)
                      }}
                    >
                      {t('instance.java')}
                    </button>
                    <button
                      className="btn btn-sm danger"
                      disabled={busy || gameState.running}
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteInstance(server.id, displayName)
                      }}
                    >
                      {t('instance.delete')}
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
          <div className="actions actions-compact">
            <span className="muted">{t('home.running')}</span>
            <button className="btn btn-sm" onClick={onOpenLogs}>
              {t('nav.logs')}
            </button>
            <button className="btn btn-sm danger" onClick={() => void onKill()}>
              {t('home.kill')}
            </button>
          </div>
        )}
      </div>

      <InstanceJavaModal
        open={Boolean(javaServer)}
        serverId={javaServer?.id || ''}
        serverName={
          javaServer
            ? resolveServerDisplayName(
                javaServer.name,
                statuses[javaServer.id]?.description,
                config.cachedServerNames[javaServer.id]
              )
            : ''
        }
        config={config}
        totalMemoryMb={totalMemoryMb}
        packMin={javaServer?.java.ram.minimum}
        packMax={javaServer?.java.ram.recommended}
        onClose={() => setJavaServerId(null)}
        onSaved={onConfigChange}
      />

      <InstanceModsModal
        open={Boolean(modsServer)}
        serverId={modsServer?.id || ''}
        serverName={
          modsServer
            ? resolveServerDisplayName(
                modsServer.name,
                statuses[modsServer.id]?.description,
                config.cachedServerNames[modsServer.id]
              )
            : ''
        }
        gameRunning={gameState.running}
        reloadToken={modsReloadToken}
        onClose={() => onModsServerIdChange(null)}
      />

      <InstanceOnlineModal
        open={Boolean(onlineServer)}
        host={onlineServer?.address || ''}
        serverName={
          onlineServer
            ? resolveServerDisplayName(
                onlineServer.name,
                statuses[onlineServer.id]?.description,
                config.cachedServerNames[onlineServer.id]
              )
            : ''
        }
        onClose={() => setOnlineServerId(null)}
      />

      <InstanceMapModal
        open={Boolean(mapServer)}
        serverId={mapServer?.id || ''}
        host={mapServer?.address || ''}
        serverName={
          mapServer
            ? resolveServerDisplayName(
                mapServer.name,
                statuses[mapServer.id]?.description,
                config.cachedServerNames[mapServer.id]
              )
            : ''
        }
        onClose={() => setMapServerId(null)}
      />
    </div>
  )
}

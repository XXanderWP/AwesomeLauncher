import { useCallback, useEffect, useState } from 'react'
import type { OfflinePlayer, OnlinePlayer, OnlinePlayersResult } from '@shared/types'
import { t } from '../i18n'
import { ElybyAvatarPreview } from './ElybyAvatarPreview'

interface Props {
  open: boolean
  host: string
  serverName: string
  onClose: () => void
}

type ListedPlayer = OnlinePlayer | OfflinePlayer

function hasSession(player: ListedPlayer): player is OnlinePlayer {
  return 'sessionFormatted' in player
}

function PlayerRow({
  player,
  showSession
}: {
  player: ListedPlayer
  showSession: boolean
}): React.JSX.Element {
  const [profileUrl, setProfileUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfileUrl(null)
    void (async () => {
      try {
        const resolved = await window.awesomeAPI.resolveElybyProfile({
          username: player.name,
          uuid: player.uuid
        })
        if (!cancelled) {
          setProfileUrl(resolved.profileUrl)
        }
      } catch {
        if (!cancelled) setProfileUrl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [player.name, player.uuid])

  async function openProfile(): Promise<void> {
    if (!profileUrl) return
    await window.awesomeAPI.openExternal(profileUrl)
  }

  const meta = (
    <>
      <strong>{player.name}</strong>
      <span className="muted online-player-uuid">{player.uuid}</span>
    </>
  )

  const sessionFormatted = showSession && hasSession(player) ? player.sessionFormatted : null

  return (
    <div className="online-player-row">
      <div className="online-player-identity">
        <ElybyAvatarPreview username={player.name} size={40} className="online-player-avatar" />
        {profileUrl ? (
          <button
            type="button"
            className="online-player-meta online-player-meta-link"
            title={t('instance.online.openProfile')}
            onClick={() => void openProfile()}
          >
            {meta}
          </button>
        ) : (
          <div className="online-player-meta">{meta}</div>
        )}
      </div>
      <div className="online-player-times">
        <div className="online-player-playtime" title={t('instance.online.playtime')}>
          {player.playtimeFormatted}
        </div>
        {sessionFormatted ? (
          <div className="online-player-session" title={t('instance.online.session')}>
            {sessionFormatted}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function InstanceOnlineModal({
  open,
  host,
  serverName,
  onClose
}: Props): React.JSX.Element | null {
  const [payload, setPayload] = useState<OnlinePlayersResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!host) return
    setLoading(true)
    setError(null)
    try {
      const next = await window.awesomeAPI.getOnlinePlayers(host)
      setPayload(next)
      if (!next.ok) {
        setError(next.error || t('instance.online.unavailable'))
      }
    } catch (err) {
      setPayload(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [host])

  useEffect(() => {
    if (open) {
      void refresh()
    } else {
      setPayload(null)
      setError(null)
    }
  }, [open, refresh])

  if (!open) return null

  const players = payload?.players || []
  const offlinePlayers = payload?.offlinePlayers || []
  const supportsOfflineList = Boolean(payload?.supportsOfflineList)
  const showList = Boolean(payload?.ok)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel modal-online" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>
            {t('instance.online.title')}: {serverName}
          </h2>
          <div className="actions actions-compact" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {t('instance.online.refresh')}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              {t('settings.cancel')}
            </button>
          </div>
        </div>

        {error ? <div className="warn-box danger">{error}</div> : null}

        {loading && !payload ? (
          <div className="mods-loading" role="status" aria-live="polite">
            <div className="boot-spinner" aria-hidden="true" />
            <p className="mods-loading-label">{t('instance.online.loading')}</p>
          </div>
        ) : showList ? (
          <>
            <div className="status-pill online-players-count">
              <span className={`dot ${players.length > 0 ? 'on' : 'off'}`} />
              {t('instance.online.count', payload?.online ?? 0, payload?.max ?? 0)}
              {supportsOfflineList
                ? ` · ${t('instance.online.offlineCount', payload?.offline ?? offlinePlayers.length)}`
                : null}
            </div>

            <h3 className="online-section-title">{t('instance.online.sectionOnline')}</h3>
            {players.length === 0 ? (
              <p className="muted">{t('instance.online.empty')}</p>
            ) : (
              <div className="online-players-list">
                {players.map((player) => (
                  <PlayerRow key={player.uuid} player={player} showSession />
                ))}
              </div>
            )}

            {supportsOfflineList ? (
              <>
                <h3 className="online-section-title online-section-title-offline">
                  {t('instance.online.sectionOffline')}
                </h3>
                {offlinePlayers.length === 0 ? (
                  <p className="muted">{t('instance.online.offlineEmpty')}</p>
                ) : (
                  <div className="online-players-list online-players-list-offline">
                    {offlinePlayers.map((player) => (
                      <PlayerRow key={player.uuid} player={player} showSession={false} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

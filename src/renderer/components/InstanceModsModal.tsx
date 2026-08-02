import { useCallback, useEffect, useState } from 'react'
import type { ModInfo, ServerModsPayload } from '@shared/types'
import { t } from '../i18n'

interface Props {
  open: boolean
  serverId: string
  serverName: string
  gameRunning: boolean
  reloadToken?: number
  onClose: () => void
}

function ModIcon({ mod }: { mod: ModInfo }): React.JSX.Element {
  if (mod.iconDataUrl) {
    return <img className="mod-icon" src={mod.iconDataUrl} alt="" />
  }
  return <div className="mod-icon mod-icon-fallback" aria-hidden />
}

function ModRow({
  mod,
  busy,
  onToggle,
  onDelete
}: {
  mod: ModInfo
  busy: boolean
  onToggle?: (mod: ModInfo, enabled: boolean) => void
  onDelete?: (mod: ModInfo) => void
}): React.JSX.Element {
  const isUser = mod.source === 'user'
  return (
    <div className={`mod-row${!mod.enabled ? ' disabled' : ''}`}>
      <ModIcon mod={mod} />
      <div className="mod-meta">
        <div className="mod-title">
          <strong>{mod.name}</strong>
          {mod.version ? <span className="mod-version">v{mod.version}</span> : null}
          {mod.homepage ? (
            <button
              type="button"
              className="btn btn-sm mod-page-btn"
              title={mod.homepage}
              onClick={() => {
                if (mod.homepage) void window.awesomeAPI.openExternal(mod.homepage)
              }}
            >
              {t('instance.mods.page')}
            </button>
          ) : null}
        </div>
        {mod.description ? <p className="mod-desc">{mod.description}</p> : null}
        {mod.authors.length > 0 ? (
          <p className="mod-author">
            {t('instance.mods.author')}: {mod.authors.join(', ')}
          </p>
        ) : null}
      </div>
      {isUser ? (
        <div className="mod-controls">
          <label className="switch" title={t('instance.mods.toggle')}>
            <input
              type="checkbox"
              checked={mod.enabled}
              disabled={busy}
              onChange={(e) => onToggle?.(mod, e.target.checked)}
            />
            <span className="switch-track" />
          </label>
          <button
            type="button"
            className="btn btn-sm danger"
            disabled={busy}
            onClick={() => onDelete?.(mod)}
          >
            {t('instance.mods.delete')}
          </button>
        </div>
      ) : (
        <div className="mod-controls mod-controls-locked">
          <span className="muted">{t('instance.mods.required')}</span>
        </div>
      )}
    </div>
  )
}

export function InstanceModsModal({
  open,
  serverId,
  serverName,
  gameRunning,
  reloadToken = 0,
  onClose
}: Props): React.JSX.Element | null {
  const [payload, setPayload] = useState<ServerModsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.awesomeAPI.listMods(serverId)
      setPayload(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    if (open) {
      void refresh()
    } else {
      setPayload(null)
      setError(null)
    }
  }, [open, refresh, reloadToken])

  if (!open) return null

  async function toggle(mod: ModInfo, enabled: boolean): Promise<void> {
    if (gameRunning) {
      setError(t('instance.mods.gameRunning'))
      return
    }
    setBusyPath(mod.filePath)
    setError(null)
    try {
      const updated = await window.awesomeAPI.setModEnabled(serverId, mod.filePath, enabled)
      setPayload((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          userMods: prev.userMods.map((m) => (m.filePath === mod.filePath ? updated : m))
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      await refresh()
    } finally {
      setBusyPath(null)
    }
  }

  async function remove(mod: ModInfo): Promise<void> {
    if (gameRunning) {
      setError(t('instance.mods.gameRunning'))
      return
    }
    const ok = window.confirm(t('instance.mods.delete.confirm', mod.name))
    if (!ok) return
    setBusyPath(mod.filePath)
    setError(null)
    try {
      await window.awesomeAPI.deleteMod(serverId, mod.filePath)
      setPayload((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          userMods: prev.userMods.filter((m) => m.filePath !== mod.filePath)
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      await refresh()
    } finally {
      setBusyPath(null)
    }
  }

  const userMods = payload?.userMods || []
  const commonMods = payload?.commonMods || []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel modal-mods" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>
            {t('instance.mods.title')}: {serverName}
          </h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t('settings.cancel')}
          </button>
        </div>
        <p className="hint">{t('instance.mods.hint')}</p>
        {gameRunning ? (
          <div className="warn-box warning">{t('instance.mods.gameRunning')}</div>
        ) : null}
        {error ? <div className="warn-box danger">{error}</div> : null}
        {loading && !payload ? (
          <div className="mods-loading" role="status" aria-live="polite">
            <div className="boot-spinner" aria-hidden="true" />
            <p className="mods-loading-label">{t('instance.mods.loading')}</p>
          </div>
        ) : (
          <div className="mods-scroll">
            <h3 className="mods-section-title">{t('instance.mods.user')}</h3>
            {userMods.length === 0 ? (
              <div className="warn-box warning">{t('instance.mods.userEmpty')}</div>
            ) : (
              <div className="mods-list">
                {userMods.map((mod) => (
                  <ModRow
                    key={mod.filePath}
                    mod={mod}
                    busy={busyPath === mod.filePath || gameRunning}
                    onToggle={(m, enabled) => void toggle(m, enabled)}
                    onDelete={(m) => void remove(m)}
                  />
                ))}
              </div>
            )}

            <h3 className="mods-section-title">{t('instance.mods.common')}</h3>
            {commonMods.length === 0 ? (
              <p className="muted">{t('instance.mods.commonEmpty')}</p>
            ) : (
              <div className="mods-list">
                {commonMods.map((mod) => (
                  <ModRow key={mod.filePath} mod={mod} busy />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

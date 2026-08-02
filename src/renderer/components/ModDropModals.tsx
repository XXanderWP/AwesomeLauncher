import type { ModPreview } from '@shared/types'
import { t } from '../i18n'

function ModPreviewIcon({ mod }: { mod: ModPreview }): React.JSX.Element {
  if (mod.iconDataUrl) {
    return <img className="mod-icon" src={mod.iconDataUrl} alt="" />
  }
  return <div className="mod-icon mod-icon-fallback" aria-hidden />
}

export function ModDropNoticeModal({
  kind,
  onClose
}: {
  kind: 'open-mods' | 'game-running'
  onClose: () => void
}): React.JSX.Element {
  const message =
    kind === 'game-running' ? t('instance.mods.gameRunning') : t('instance.mods.drop.openMods')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel modal-notice" onClick={(e) => e.stopPropagation()}>
        <h2>{t('instance.mods.drop.title')}</h2>
        <div className="warn-box warning">{message}</div>
        <div className="actions actions-compact" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-sm primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModInstallConfirmModal({
  serverName,
  mods,
  busy,
  error,
  onCancel,
  onConfirm
}: {
  serverName: string
  mods: ModPreview[]
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal panel modal-mods-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>{t('instance.mods.drop.confirmTitle')}</h2>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
            {t('settings.cancel')}
          </button>
        </div>
        <p className="hint">{t('instance.mods.drop.confirmHint', serverName)}</p>
        {error ? <div className="warn-box danger">{error}</div> : null}
        <div className="mods-list mods-confirm-list">
          {mods.map((mod) => (
            <div key={mod.sourcePath} className="mod-row">
              <ModPreviewIcon mod={mod} />
              <div className="mod-meta">
                <div className="mod-title">
                  <strong>{mod.name}</strong>
                  {mod.version ? <span className="mod-version">v{mod.version}</span> : null}
                </div>
                {mod.description ? <p className="mod-desc">{mod.description}</p> : null}
                {mod.authors.length > 0 ? (
                  <p className="mod-author">
                    {t('instance.mods.author')}: {mod.authors.join(', ')}
                  </p>
                ) : null}
                <p className="mod-author">{mod.fileName}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="actions actions-compact" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-sm primary" disabled={busy} onClick={onConfirm}>
            {busy ? t('common.loading') : t('instance.mods.drop.install')}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
            {t('settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

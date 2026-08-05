import { t } from '../i18n'

export function LegacyDataModal({
  legacyPath,
  busy,
  onAccept,
  onDecline
}: {
  legacyPath: string
  busy: boolean
  onAccept: () => void
  onDecline: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal panel modal-notice" onClick={(e) => e.stopPropagation()}>
        <h2>{t('legacyData.title')}</h2>
        <p className="hint">{t('legacyData.body')}</p>
        <p className="hint mono-path">{legacyPath}</p>
        <div className="actions actions-compact" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onDecline}>
            {t('legacyData.decline')}
          </button>
          <button type="button" className="btn btn-sm primary" disabled={busy} onClick={onAccept}>
            {t('legacyData.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

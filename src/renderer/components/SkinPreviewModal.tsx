import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'
import { getElybySkinDataUrl } from '../skin/elybySkinCache'
import { SkinViewerCanvas } from './SkinViewerCanvas'

interface Props {
  username: string
  onClose: () => void
}

export function SkinPreviewModal({ username, onClose }: Props): React.JSX.Element {
  const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setSkinDataUrl(null)
    void (async () => {
      const dataUrl = await getElybySkinDataUrl(username)
      if (cancelled) return
      setSkinDataUrl(dataUrl)
      setFailed(!dataUrl)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="skin-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('skin.preview.title', username)}
      onClick={onClose}
    >
      <button type="button" className="btn btn-sm skin-preview-close" onClick={onClose}>
        {t('settings.cancel')}
      </button>

      <div className="skin-preview-center" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="mods-loading" role="status" aria-live="polite">
            <div className="boot-spinner" aria-hidden="true" />
            <p className="mods-loading-label">{t('skin.preview.loading')}</p>
          </div>
        ) : failed ? (
          <p className="muted">{t('skin.preview.unavailable')}</p>
        ) : (
          <SkinViewerCanvas
            skinDataUrl={skinDataUrl}
            width={320}
            height={420}
            enableControls
            autoRotate={false}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

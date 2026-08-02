import { useEffect, useState } from 'react'
import { t } from '../i18n'

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.awesomeAPI.windowIsMaximized().then((value) => {
      if (!cancelled) setMaximized(value)
    })
    const off = window.awesomeAPI.onWindowMaximized((value) => setMaximized(value))
    return () => {
      cancelled = true
      off()
    }
  }, [])

  return (
    <header className="titlebar" aria-label={t('titlebar.label')}>
      <div className="titlebar-drag" onDoubleClick={() => void window.awesomeAPI.windowToggleMaximize()}>
        <span className="titlebar-title">{t('app.name')}</span>
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          aria-label={t('titlebar.minimize')}
          onClick={() => void window.awesomeAPI.windowMinimize()}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
          onClick={() => void window.awesomeAPI.windowToggleMaximize()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                d="M3.5 4.5h6v6h-6zM2.5 7.5V2.5h5"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <rect
                x="1.5"
                y="1.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          aria-label={t('titlebar.close')}
          onClick={() => void window.awesomeAPI.windowClose()}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1z"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}

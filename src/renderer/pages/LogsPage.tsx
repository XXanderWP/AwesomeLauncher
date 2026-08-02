import { useEffect, useRef, useState } from 'react'
import type { GameLogLine } from '@shared/types'
import { t } from '../i18n'

interface Props {
  logs: GameLogLine[]
  running: boolean
  onClear: () => void | Promise<void>
  onBack: () => void
  onKill: () => void | Promise<void>
}

export function LogsPage({ logs, running, onClear, onBack, onKill }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs])

  async function exportLogs(): Promise<void> {
    setExportBusy(true)
    setExportMessage(null)
    try {
      const result = await window.awesomeAPI.exportGameLogs()
      if (result.saved) {
        setExportMessage(t('logs.export.saved', result.path))
      }
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <h1>{t('logs.title')}</h1>
        <div className="actions actions-compact" style={{ marginTop: 0 }}>
          <button className="btn btn-sm" onClick={onBack}>
            {t('logs.back')}
          </button>
          <button className="btn btn-sm" disabled={exportBusy} onClick={() => void exportLogs()}>
            {exportBusy ? t('logs.export.busy') : t('logs.export')}
          </button>
          <button className="btn btn-sm" onClick={() => void onClear()}>
            {t('logs.clear')}
          </button>
          {running && (
            <button className="btn btn-sm danger" onClick={() => void onKill()}>
              {t('home.kill')}
            </button>
          )}
        </div>
      </div>

      <div className="warn-box warning logs-hint">{t('logs.hint')}</div>

      {exportMessage ? <p className="muted logs-export-status">{exportMessage}</p> : null}

      <div className="logs" ref={ref}>
        {logs.length === 0 ? (
          <div className="muted">{t('logs.empty')}</div>
        ) : (
          logs.map((line, idx) => (
            <div
              key={`${line.timestamp}-${idx}`}
              className={
                line.stream === 'stderr'
                  ? 'log-stderr'
                  : line.stream === 'system'
                    ? 'log-system'
                    : ''
              }
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs])

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

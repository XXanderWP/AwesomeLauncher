import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '@shared/types'
import { ELYBY_REGISTER_URL } from '@shared/types'
import { t } from '../i18n'

interface Props {
  onSuccess: (config: AppConfig) => void | Promise<void>
}

type Mode = 'device' | 'password'

export function LoginPage({ onSuccess }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('device')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verifyUri, setVerifyUri] = useState('https://account.ely.by/code')
  const [deviceBusy, setDeviceBusy] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef(5)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
      void window.awesomeAPI.cancelDeviceLogin()
    }
  }, [])

  async function submitPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const next = await window.awesomeAPI.login(
        username.trim(),
        password,
        totp.trim() || undefined
      )
      await onSuccess(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  function schedulePoll(): void {
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => {
      void pollOnce()
    }, intervalRef.current * 1000)
  }

  async function pollOnce(): Promise<void> {
    try {
      const result = await window.awesomeAPI.pollDeviceLogin()
      if (result.status === 'pending') {
        schedulePoll()
        return
      }
      if (result.status === 'slow_down') {
        intervalRef.current = Math.max(intervalRef.current + 1, result.interval || 5)
        schedulePoll()
        return
      }
      if (result.status === 'success') {
        setDeviceBusy(false)
        setUserCode(null)
        await onSuccess(result.config)
        return
      }
      setDeviceBusy(false)
      setUserCode(null)
      setError(result.status === 'denied' ? result.message : t('login.device.expired'))
    } catch (err) {
      setDeviceBusy(false)
      setUserCode(null)
      setError(err instanceof Error ? err.message : t('login.error'))
    }
  }

  async function startDevice(): Promise<void> {
    setError(null)
    setDeviceBusy(true)
    try {
      const started = await window.awesomeAPI.startDeviceLogin()
      setUserCode(started.userCode)
      setVerifyUri(started.verificationUri)
      intervalRef.current = started.interval || 5
      schedulePoll()
    } catch (err) {
      setDeviceBusy(false)
      setError(err instanceof Error ? err.message : t('login.error'))
    }
  }

  async function cancelDevice(): Promise<void> {
    if (pollRef.current) clearTimeout(pollRef.current)
    await window.awesomeAPI.cancelDeviceLogin()
    setDeviceBusy(false)
    setUserCode(null)
  }

  return (
    <div className="panel" style={{ maxWidth: 520, margin: '8vh auto' }}>
      <h1>{t('login.title')}</h1>
      <div className="tabs">
        <button
          type="button"
          className={`tab${mode === 'device' ? ' active' : ''}`}
          onClick={() => setMode('device')}
        >
          {t('login.tab.device')}
        </button>
        <button
          type="button"
          className={`tab${mode === 'password' ? ' active' : ''}`}
          onClick={() => setMode('password')}
        >
          {t('login.tab.password')}
        </button>
      </div>

      {mode === 'device' ? (
        <div className="form">
          <p className="muted">{t('login.device.hint')}</p>
          {!userCode ? (
            <button
              className="btn primary"
              type="button"
              disabled={deviceBusy}
              onClick={() => void startDevice()}
            >
              {deviceBusy ? t('common.loading') : t('login.device.start')}
            </button>
          ) : (
            <>
              <div className="device-code-box">
                <div className="muted">{t('login.device.code')}</div>
                <div className="device-code">{userCode}</div>
                <a href={verifyUri} target="_blank" rel="noreferrer">
                  {verifyUri}
                </a>
                <div className="hint">{t('login.device.waiting')}</div>
              </div>
              <button className="btn" type="button" onClick={() => void cancelDevice()}>
                {t('login.device.cancel')}
              </button>
            </>
          )}
        </div>
      ) : (
        <form className="form" onSubmit={(e) => void submitPassword(e)}>
          <label>
            {t('login.username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t('login.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            {t('login.totp')}
            <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
          </label>
          <button className="btn primary" disabled={loading}>
            {loading ? t('common.loading') : t('login.submit')}
          </button>
        </form>
      )}

      {error && (
        <div className="error-box" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <a
        href={ELYBY_REGISTER_URL}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'inline-block', marginTop: 12 }}
      >
        {t('login.register')}
      </a>
    </div>
  )
}

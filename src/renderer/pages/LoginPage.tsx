import { useState } from 'react'
import type { AppConfig } from '@shared/types'
import { ELYBY_REGISTER_URL } from '@shared/types'
import { t } from '../i18n'

interface Props {
  onSuccess: (config: AppConfig) => void | Promise<void>
}

export function LoginPage({ onSuccess }: Props): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent): Promise<void> {
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

  return (
    <div className="panel" style={{ maxWidth: 480, margin: '8vh auto' }}>
      <h1>{t('login.title')}</h1>
      <form className="form" onSubmit={(e) => void submit(e)}>
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
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" disabled={loading}>
          {loading ? t('common.loading') : t('login.submit')}
        </button>
        <a href={ELYBY_REGISTER_URL} target="_blank" rel="noreferrer">
          {t('login.register')}
        </a>
      </form>
    </div>
  )
}

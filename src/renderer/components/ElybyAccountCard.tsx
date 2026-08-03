import type { ElybyAccount } from '@shared/types'
import { ELYBY_ACCOUNT_DASHBOARD_URL } from '@shared/elybyProfile'
import { elybyProfileUrl } from '@shared/elybyProfile'
import { t } from '../i18n'
import { ElybyAvatarPreview } from './ElybyAvatarPreview'

interface Props {
  account: ElybyAccount
  onLogout: () => void | Promise<void>
}

export function ElybyAccountCard({ account, onLogout }: Props): React.JSX.Element {
  const profileUrl = elybyProfileUrl(account)

  async function openUrl(url: string): Promise<void> {
    await window.awesomeAPI.openExternal(url)
  }

  return (
    <section className="account-card" aria-label={t('account.cardTitle')}>
      <ElybyAvatarPreview username={account.displayName || account.username} size={72} />
      <div className="account-card-meta">
        <div className="account-card-title">{account.displayName}</div>
        <div className="actions actions-compact" style={{ marginTop: 10 }}>
          <button
            className="btn btn-sm primary"
            type="button"
            onClick={() => void openUrl(profileUrl)}
          >
            {t('account.openProfile')}
          </button>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => void openUrl(ELYBY_ACCOUNT_DASHBOARD_URL)}
          >
            {t('account.manage')}
          </button>
          <button className="btn btn-sm" type="button" onClick={() => void onLogout()}>
            {t('home.logout')}
          </button>
        </div>
      </div>
    </section>
  )
}

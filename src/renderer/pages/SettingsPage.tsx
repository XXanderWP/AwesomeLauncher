import { useEffect, useState } from 'react'
import type { AppConfig, UpdateStatus } from '@shared/types'
import { t } from '../i18n'

interface Props {
  config: AppConfig
  updateStatus: UpdateStatus | null
  onChange: (partial: Record<string, unknown>) => void | Promise<void>
  onBrowseDataDir: () => void | Promise<void>
}

export function SettingsPage({
  config,
  updateStatus,
  onChange,
  onBrowseDataDir
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const serverId = draft.selectedServerId || 'default'
  const java = draft.javaByServer[serverId] || {
    minRamMb: 6144,
    maxRamMb: 9504,
    javaPath: '',
    jvmOptions: []
  }

  useEffect(() => {
    setDraft(config)
  }, [config])

  async function save(): Promise<void> {
    await onChange({
      settings: draft.settings,
      javaByServer: {
        ...draft.javaByServer,
        [serverId]: java
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="panel settings-grid">
      <h1>{t('settings.title')}</h1>

      <section className="field">
        <h2>{t('settings.general')}</h2>
        <label className="field">
          {t('settings.language')}
          <select
            value={draft.settings.launcher.language}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  launcher: {
                    ...draft.settings.launcher,
                    language: e.target.value as AppConfig['settings']['launcher']['language']
                  }
                }
              })
            }
          >
            <option value="system">{t('settings.language.system')}</option>
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="uk">Українська</option>
          </select>
        </label>

        <label className="field">
          {t('settings.dataDirectory')}
          <div className="field-row">
            <input value={draft.settings.launcher.dataDirectory} readOnly />
            <button className="btn" type="button" onClick={() => void onBrowseDataDir()}>
              {t('settings.browse')}
            </button>
          </div>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.settings.launcher.preservePlayerConfigs}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  launcher: {
                    ...draft.settings.launcher,
                    preservePlayerConfigs: e.target.checked
                  }
                }
              })
            }
          />
          {t('settings.preserveConfigs')}
        </label>
        <div className="hint">{t('settings.preserveConfigs.hint')}</div>
      </section>

      <section className="field">
        <h2>{t('settings.game')}</h2>
        <label className="field">
          {t('settings.resolution')}
          <div className="field-row">
            <input
              type="number"
              value={draft.settings.game.resWidth}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  settings: {
                    ...draft.settings,
                    game: { ...draft.settings.game, resWidth: Number(e.target.value) || 1280 }
                  }
                })
              }
            />
            <span>×</span>
            <input
              type="number"
              value={draft.settings.game.resHeight}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  settings: {
                    ...draft.settings,
                    game: { ...draft.settings.game, resHeight: Number(e.target.value) || 720 }
                  }
                })
              }
            />
          </div>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.settings.game.fullscreen}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  game: { ...draft.settings.game, fullscreen: e.target.checked }
                }
              })
            }
          />
          {t('settings.fullscreen')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.settings.game.autoConnect}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  game: { ...draft.settings.game, autoConnect: e.target.checked }
                }
              })
            }
          />
          {t('settings.autoConnect')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.settings.game.launchDetached}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  game: { ...draft.settings.game, launchDetached: e.target.checked }
                }
              })
            }
          />
          {t('settings.detached')}
        </label>
      </section>

      <section className="field">
        <h2>{t('settings.java')}</h2>
        <label className="field">
          {t('settings.minRam')}
          <input
            type="number"
            value={java.minRamMb}
            onChange={(e) => {
              const minRamMb = Number(e.target.value) || 2048
              setDraft({
                ...draft,
                javaByServer: {
                  ...draft.javaByServer,
                  [serverId]: { ...java, minRamMb }
                }
              })
            }}
          />
        </label>
        <label className="field">
          {t('settings.maxRam')}
          <input
            type="number"
            value={java.maxRamMb}
            onChange={(e) => {
              const maxRamMb = Number(e.target.value) || 4096
              setDraft({
                ...draft,
                javaByServer: {
                  ...draft.javaByServer,
                  [serverId]: { ...java, maxRamMb }
                }
              })
            }}
          />
        </label>
        <label className="field">
          {t('settings.javaPath')}
          <input
            value={java.javaPath || ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                javaByServer: {
                  ...draft.javaByServer,
                  [serverId]: { ...java, javaPath: e.target.value || null }
                }
              })
            }
            placeholder="auto"
          />
        </label>
        <label className="field">
          {t('settings.jvmOptions')}
          <textarea
            rows={5}
            value={(java.jvmOptions || []).join('\n')}
            onChange={(e) =>
              setDraft({
                ...draft,
                javaByServer: {
                  ...draft.javaByServer,
                  [serverId]: {
                    ...java,
                    jvmOptions: e.target.value
                      .split(/\r?\n/)
                      .map((x) => x.trim())
                      .filter(Boolean)
                  }
                }
              })
            }
          />
        </label>
      </section>

      <section className="field">
        <h2>{t('settings.updates')}</h2>
        <label className="field">
          {t('settings.updateMode')}
          <select
            value={draft.settings.launcher.updateMode}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  launcher: {
                    ...draft.settings.launcher,
                    updateMode: e.target.value as AppConfig['settings']['launcher']['updateMode']
                  }
                }
              })
            }
          >
            <option value="auto-install-on-quit">{t('settings.updateMode.autoInstall')}</option>
            <option value="auto-download-manual-install">
              {t('settings.updateMode.manualInstall')}
            </option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.settings.launcher.allowPrerelease}
            onChange={(e) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  launcher: {
                    ...draft.settings.launcher,
                    allowPrerelease: e.target.checked
                  }
                }
              })
            }
          />
          {t('settings.allowPrerelease')}
        </label>
        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => void window.awesomeAPI.checkForUpdates()}
          >
            {t('settings.checkUpdate')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!updateStatus?.available || updateStatus.downloaded}
            onClick={() => void window.awesomeAPI.downloadUpdate()}
          >
            {t('settings.downloadUpdate')}
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!updateStatus?.downloaded}
            onClick={() => void window.awesomeAPI.installUpdate()}
          >
            {t('settings.installUpdate')}
          </button>
        </div>
        {updateStatus?.info && (
          <div className="hint">
            {updateStatus.info.version}
            {updateStatus.downloading ? ` · ${updateStatus.progress}%` : ''}
            {updateStatus.downloaded ? ' · ready' : ''}
            {updateStatus.error ? ` · ${updateStatus.error}` : ''}
          </div>
        )}
      </section>

      <div className="actions">
        <button className="btn primary" type="button" onClick={() => void save()}>
          {t('settings.save')}
        </button>
        {saved && <span className="muted">{t('settings.saved')}</span>}
      </div>
    </div>
  )
}

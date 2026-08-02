import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, LanguageSetting, UpdateStatus } from '@shared/types'
import { validateRamLimits } from '@shared/ramValidation'
import { t } from '../i18n'
import { RamSliderField } from '../components/RamSliderField'

interface Props {
  config: AppConfig
  updateStatus: UpdateStatus | null
  totalMemoryMb: number
  platform: NodeJS.Platform | string
  onChange: (partial: Record<string, unknown>) => void | Promise<void>
  onBrowseDataDir: () => void | Promise<void>
  onPreviewLanguage: (language: LanguageSetting) => void | Promise<void>
}

export function SettingsPage({
  config,
  updateStatus,
  totalMemoryMb,
  platform,
  onChange,
  onBrowseDataDir,
  onPreviewLanguage
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const java = draft.javaDefaults
  const isMac = platform === 'darwin'

  useEffect(() => {
    setDraft(config)
  }, [config])

  const validation = useMemo(
    () => validateRamLimits(java.minRamMb, java.maxRamMb, totalMemoryMb),
    [java.minRamMb, java.maxRamMb, totalMemoryMb]
  )

  const sliderMax = Math.max(1024, totalMemoryMb - 256)

  async function save(): Promise<void> {
    if (!validation.canSave) return
    await onChange({
      settings: draft.settings,
      javaDefaults: java
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function cancel(): void {
    setDraft(config)
    void onPreviewLanguage(config.settings.launcher.language)
  }

  async function onLanguageChange(language: LanguageSetting): Promise<void> {
    setDraft({
      ...draft,
      settings: {
        ...draft.settings,
        launcher: {
          ...draft.settings.launcher,
          language
        }
      }
    })
    await onPreviewLanguage(language)
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
            onChange={(e) => void onLanguageChange(e.target.value as LanguageSetting)}
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
            <button className="btn btn-sm" type="button" onClick={() => void onBrowseDataDir()}>
              {t('settings.browse')}
            </button>
          </div>
        </label>

        <label className="check">
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
          <span>
            <strong>{t('settings.preserveConfigs')}</strong>
            <small>{t('settings.preserveConfigs.hint')}</small>
          </span>
        </label>
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
        <label className="check">
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
          <span>{t('settings.fullscreen')}</span>
        </label>
        <label className="check">
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
          <span>{t('settings.autoConnect')}</span>
        </label>
        <label className="check">
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
          <span>{t('settings.detached')}</span>
        </label>
      </section>

      <section className="field">
        <h2>{t('settings.java.general')}</h2>
        <p className="hint">{t('settings.java.generalHint')}</p>
        <RamSliderField
          label={t('settings.minRam')}
          value={java.minRamMb}
          min={512}
          max={sliderMax}
          invalid={validation.minGreaterThanMax}
          onChange={(minRamMb) =>
            setDraft({
              ...draft,
              javaDefaults: { ...java, minRamMb }
            })
          }
        />
        <RamSliderField
          label={t('settings.maxRam')}
          value={java.maxRamMb}
          min={512}
          max={sliderMax}
          invalid={validation.minGreaterThanMax || validation.maxAtOrAboveTotal}
          onChange={(maxRamMb) =>
            setDraft({
              ...draft,
              javaDefaults: { ...java, maxRamMb }
            })
          }
        />

        {validation.minGreaterThanMax && (
          <div className="warn-box danger">{t('settings.ram.minMaxError')}</div>
        )}
        {validation.maxAtOrAboveTotal && (
          <div className="warn-box danger">{t('settings.ram.fullError', totalMemoryMb)}</div>
        )}
        {!validation.minGreaterThanMax &&
          !validation.maxAtOrAboveTotal &&
          validation.warningLevel === 'red' && (
            <div className="warn-box danger">{t('settings.ram.redWarning')}</div>
          )}
        {!validation.minGreaterThanMax &&
          !validation.maxAtOrAboveTotal &&
          validation.warningLevel === 'yellow' && (
            <div className="warn-box warning">{t('settings.ram.yellowWarning')}</div>
          )}

        <label className="field">
          {t('settings.javaPath')}
          <input
            value={java.javaPath || ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                javaDefaults: { ...java, javaPath: e.target.value || null }
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
                javaDefaults: {
                  ...java,
                  jvmOptions: e.target.value
                    .split(/\r?\n/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                }
              })
            }
          />
        </label>
      </section>

      <section className="field">
        <h2>{t('settings.updates')}</h2>
        {isMac ? (
          <p className="hint">{t('settings.macUpdateHint')}</p>
        ) : (
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
        )}
        <label className="check">
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
          <span>{t('settings.allowPrerelease')}</span>
        </label>
        <div className="actions">
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => void window.awesomeAPI.checkForUpdates()}
          >
            {t('settings.checkUpdate')}
          </button>
          {!isMac && (
            <button
              className="btn btn-sm"
              type="button"
              disabled={!updateStatus?.available || updateStatus.downloaded}
              onClick={() => void window.awesomeAPI.downloadUpdate()}
            >
              {t('settings.downloadUpdate')}
            </button>
          )}
          <button
            className="btn btn-sm primary"
            type="button"
            disabled={
              isMac
                ? !updateStatus?.available || Boolean(updateStatus.downloading)
                : !updateStatus?.downloaded
            }
            onClick={() => void window.awesomeAPI.installUpdate()}
          >
            {isMac ? t('settings.installUpdateMac') : t('settings.installUpdate')}
          </button>
        </div>
        {(updateStatus?.info || updateStatus?.error) && (
          <div className="hint">
            {updateStatus.info?.version || ''}
            {updateStatus.downloading
              ? ` · ${isMac ? t('settings.macInstalling') : `${updateStatus.progress}%`}`
              : ''}
            {!isMac && updateStatus.downloaded ? ' · ready' : ''}
            {updateStatus.error ? ` · ${updateStatus.error}` : ''}
          </div>
        )}
      </section>

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={!validation.canSave}
          onClick={() => void save()}
        >
          {t('settings.save')}
        </button>
        <button className="btn" type="button" onClick={cancel}>
          {t('settings.cancel')}
        </button>
        {saved && <span className="muted">{t('settings.saved')}</span>}
      </div>
    </div>
  )
}

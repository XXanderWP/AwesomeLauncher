import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, JavaServerSettings } from '@shared/types'
import { getDefaultJvmOptions } from '@shared/javaDefaults'
import { validateRamLimits } from '@shared/ramValidation'
import { t } from '../i18n'
import { RamSliderField } from './RamSliderField'

interface Props {
  open: boolean
  serverId: string
  serverName: string
  config: AppConfig
  totalMemoryMb: number
  packMin?: number
  packMax?: number
  onClose: () => void
  onSaved: (config: AppConfig) => void | Promise<void>
}

export function InstanceJavaModal({
  open,
  serverId,
  serverName,
  config,
  totalMemoryMb,
  packMin = 2048,
  packMax = 8192,
  onClose,
  onSaved
}: Props): React.JSX.Element | null {
  const defaults = config.javaDefaults
  const existing = config.javaByServer[serverId]
  const [useGlobal, setUseGlobal] = useState(!existing)
  const [draft, setDraft] = useState<JavaServerSettings>(existing || { ...defaults })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUseGlobal(!existing)
      setDraft(existing || { ...defaults })
    }
  }, [open, existing, defaults])

  const display = useGlobal ? defaults : draft

  const validation = useMemo(
    () => validateRamLimits(display.minRamMb, display.maxRamMb, totalMemoryMb),
    [display.minRamMb, display.maxRamMb, totalMemoryMb]
  )

  if (!open) return null

  async function save(): Promise<void> {
    if (!useGlobal && !validation.canSave) return
    setSaving(true)
    try {
      if (useGlobal) {
        const javaByServer = { ...config.javaByServer }
        delete javaByServer[serverId]
        const next = await window.awesomeAPI.updateConfig({ javaByServer })
        await onSaved(next)
      } else {
        const next = await window.awesomeAPI.updateConfig({
          javaByServer: {
            ...config.javaByServer,
            [serverId]: {
              minRamMb: draft.minRamMb,
              maxRamMb: draft.maxRamMb,
              javaPath: draft.javaPath,
              jvmOptions: draft.jvmOptions
            }
          }
        })
        await onSaved(next)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function toggleUseGlobal(checked: boolean): void {
    setUseGlobal(checked)
    if (!checked && !existing) {
      setDraft({ ...defaults })
    }
  }

  const sliderMax = Math.max(1024, totalMemoryMb - 256)
  const canSave = useGlobal || validation.canSave

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t('instance.java.title')}: {serverName}
        </h2>
        <p className="hint">{t('instance.java.hint')}</p>

        <label className="check">
          <input
            type="checkbox"
            checked={useGlobal}
            onChange={(e) => toggleUseGlobal(e.target.checked)}
          />
          <span>
            <strong>{t('instance.java.useGlobal')}</strong>
            <small>{t('instance.java.useGlobal.hint')}</small>
          </span>
        </label>

        <RamSliderField
          label={t('settings.minRam')}
          value={display.minRamMb}
          min={512}
          max={sliderMax}
          invalid={!useGlobal && validation.minGreaterThanMax}
          disabled={useGlobal}
          onChange={(minRamMb) => setDraft({ ...draft, minRamMb })}
        />
        <RamSliderField
          label={t('settings.maxRam')}
          value={display.maxRamMb}
          min={512}
          max={sliderMax}
          invalid={!useGlobal && (validation.minGreaterThanMax || validation.maxAtOrAboveTotal)}
          disabled={useGlobal}
          onChange={(maxRamMb) => setDraft({ ...draft, maxRamMb })}
        />

        {!useGlobal && validation.minGreaterThanMax && (
          <div className="warn-box danger">{t('settings.ram.minMaxError')}</div>
        )}
        {!useGlobal && validation.maxAtOrAboveTotal && (
          <div className="warn-box danger">{t('settings.ram.fullError', totalMemoryMb)}</div>
        )}
        {!useGlobal &&
          !validation.minGreaterThanMax &&
          !validation.maxAtOrAboveTotal &&
          validation.warningLevel === 'red' && (
            <div className="warn-box danger">{t('settings.ram.redWarning')}</div>
          )}
        {!useGlobal &&
          !validation.minGreaterThanMax &&
          !validation.maxAtOrAboveTotal &&
          validation.warningLevel === 'yellow' && (
            <div className="warn-box warning">{t('settings.ram.yellowWarning')}</div>
          )}

        <label className="field">
          {t('settings.javaPath')}
          <input
            value={display.javaPath || ''}
            placeholder="auto"
            disabled={useGlobal}
            onChange={(e) => setDraft({ ...draft, javaPath: e.target.value || null })}
          />
        </label>
        <div className="field">
          <div className="field-row">
            <label htmlFor="instance-jvm-options">{t('settings.jvmOptions')}</label>
            <button
              className="btn btn-sm"
              type="button"
              disabled={useGlobal}
              onClick={() => setDraft({ ...draft, jvmOptions: getDefaultJvmOptions() })}
            >
              {t('settings.jvmOptions.reset')}
            </button>
          </div>
          <textarea
            id="instance-jvm-options"
            rows={4}
            disabled={useGlobal}
            value={(display.jvmOptions || []).join('\n')}
            onChange={(e) =>
              setDraft({
                ...draft,
                jvmOptions: e.target.value
                  .split(/\r?\n/)
                  .map((x) => x.trim())
                  .filter(Boolean)
              })
            }
          />
        </div>

        <div className="hint">{t('instance.java.packHint', packMin, packMax)}</div>

        <div className="actions">
          <button
            className="btn primary"
            type="button"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {t('settings.save')}
          </button>
          <button className="btn" type="button" disabled={saving} onClick={onClose}>
            {t('settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

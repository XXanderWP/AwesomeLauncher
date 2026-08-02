import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, JavaServerSettings } from '@shared/types'
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
  const [draft, setDraft] = useState<JavaServerSettings>(existing || { ...defaults })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(existing || { ...defaults })
    }
  }, [open, existing, defaults])

  const validation = useMemo(
    () => validateRamLimits(draft.minRamMb, draft.maxRamMb, totalMemoryMb),
    [draft.minRamMb, draft.maxRamMb, totalMemoryMb]
  )

  if (!open) return null

  async function save(): Promise<void> {
    if (!validation.canSave) return
    setSaving(true)
    try {
      const next = await window.awesomeAPI.updateConfig({
        javaByServer: {
          ...config.javaByServer,
          [serverId]: draft
        }
      })
      await onSaved(next)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function resetToDefaults(): Promise<void> {
    setSaving(true)
    try {
      const javaByServer = { ...config.javaByServer }
      delete javaByServer[serverId]
      const next = await window.awesomeAPI.updateConfig({ javaByServer })
      await onSaved(next)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const sliderMax = Math.max(1024, totalMemoryMb - 256)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t('instance.java.title')}: {serverName}
        </h2>
        <p className="hint">{t('instance.java.hint')}</p>

        <RamSliderField
          label={t('settings.minRam')}
          value={draft.minRamMb}
          min={512}
          max={sliderMax}
          invalid={validation.minGreaterThanMax}
          onChange={(minRamMb) => setDraft({ ...draft, minRamMb })}
        />
        <RamSliderField
          label={t('settings.maxRam')}
          value={draft.maxRamMb}
          min={512}
          max={sliderMax}
          invalid={validation.minGreaterThanMax || validation.maxAtOrAboveTotal}
          onChange={(maxRamMb) => setDraft({ ...draft, maxRamMb })}
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
            value={draft.javaPath || ''}
            placeholder="auto"
            onChange={(e) => setDraft({ ...draft, javaPath: e.target.value || null })}
          />
        </label>
        <label className="field">
          {t('settings.jvmOptions')}
          <textarea
            rows={4}
            value={(draft.jvmOptions || []).join('\n')}
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
        </label>

        <div className="hint">{t('instance.java.packHint', packMin, packMax)}</div>

        <div className="actions">
          <button
            className="btn primary"
            type="button"
            disabled={!validation.canSave || saving}
            onClick={() => void save()}
          >
            {t('settings.save')}
          </button>
          <button className="btn" type="button" disabled={saving} onClick={onClose}>
            {t('settings.cancel')}
          </button>
          {existing && (
            <button
              className="btn"
              type="button"
              disabled={saving}
              onClick={() => void resetToDefaults()}
            >
              {t('instance.java.reset')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

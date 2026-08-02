import type { LanguageSetting, SupportedLanguage } from './types'

const SUPPORTED: SupportedLanguage[] = ['en', 'ru', 'uk']

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return SUPPORTED.includes(value as SupportedLanguage)
}

/**
 * Resolve UI language from settings + system locale.
 * Unsupported system languages fall back to English.
 */
export function resolveLanguage(
  setting: LanguageSetting,
  systemLocale: string | null | undefined
): SupportedLanguage {
  if (setting !== 'system' && isSupportedLanguage(setting)) {
    return setting
  }

  const locale = (systemLocale || 'en').toLowerCase().replace('_', '-')
  const primary = locale.split('-')[0]

  if (primary === 'ru' || locale.startsWith('ru')) return 'ru'
  if (primary === 'uk' || locale.startsWith('uk')) return 'uk'
  if (primary === 'en' || locale.startsWith('en')) return 'en'

  return 'en'
}

export function getSupportedLanguages(): SupportedLanguage[] {
  return [...SUPPORTED]
}

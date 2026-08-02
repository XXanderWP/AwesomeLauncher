# UI and internationalization

## UI

- React pages: Login, Home (server list), Settings, Logs
- Dark theme CSS variables in `src/renderer/styles/global.css`
- Border radius token: `5px`
- Branding logo: `src/renderer/assets/logo.png` (from legacy AwesomeCraft assets)
- Fonts: Sora (display), Manrope (body), JetBrains Mono (logs)

## i18n

Package: `@xxanderwp/translate-module` (`LanguageCore`)

Languages: `en`, `ru`, `uk`

Rules:

- Setting `system` uses OS locale
- Unsupported OS languages fall back to `en`
- User can override language in Settings
- Translation dictionaries live in `src/renderer/i18n/index.ts`

When adding UI strings, update **all three** language dictionaries with identical keys.

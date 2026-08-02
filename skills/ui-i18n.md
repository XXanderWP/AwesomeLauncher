# UI and internationalization

## UI

- React pages: Login, Home (account card + server list), Settings, Logs
- Home shows a dedicated Ely.by account block: avatar (rendered from skinsystem skin), nickname, UUID snippet, Open profile / Manage account / Log out
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
- User can override language in Settings (preview applies before save)
- Translation dictionaries live in `src/renderer/i18n/index.ts`

When adding UI strings, update **all three** language dictionaries with identical keys.

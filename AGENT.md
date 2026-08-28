# AwesomeCraft Launcher — Agent Guide

This repository is the **AwesomeCraft** Minecraft launcher (Electron + TypeScript + React).

## Purpose

Desktop launcher for AwesomeCraft projects. It authenticates players via **Ely.by**, downloads vanilla Minecraft plus Fabric/NeoForge pack files from `files.awesome-craft.ru`, launches the game with `authlib-injector`, and supports multiple server packs.

## License

MIT — see `LICENSE`.

## Stack

- Electron + electron-vite
- TypeScript
- React 19
- helios-core (distribution download / Java / server status)
- `@xxanderwp/translate-module` (en / ru / uk)
- electron-updater (GitHub Releases)
- Jest unit tests
- ESLint + Prettier

## Skills index

All agent knowledge lives under `skills/` (English only). Keep these files current.

| Skill file | Contents |
|------------|----------|
| `skills/tech.md` | Stack, scripts, architecture overview |
| `skills/auth.md` | Ely.by authentication and launch token flow |
| `skills/install-launch.md` | Download, integrity, config preservation, process launch |
| `skills/ui-i18n.md` | UI structure, design tokens, localization rules |
| `skills/ci-release.md` | CI/CD, packaging targets, macOS quarantine note |
| `skills/backend.md` | Remote URLs and distribution format |

## Maintenance rules for agents

1. When project behavior, APIs, paths, or conventions change, **update the matching skill file**.
2. If you add a new feature area, **create a new skill file** and register it in this `AGENT.md` table.
3. Keep **README.md** and `docs/README.*.md` synchronized with user-facing and developer-facing changes.
4. Do not invent Microsoft/offline auth — Ely.by only.
5. Never reintroduce config overwrite for player-mutable files (`options.txt`, `servers.dat`, `config/**`, etc.).
6. Prefer performance-safe patterns on Windows, Linux (AppImage), and macOS (DMG).

## Key directories

```
src/main/        Electron main process services + IPC
src/preload/     contextBridge API
src/renderer/    React UI
src/shared/      Shared types and pure helpers
resources/       authlib-injector, NeoForge locators, macOS instructions
neoforge-locator/ version-specific FML candidate locator sources
build/           App icons / branding
tests/           Jest unit tests
.github/workflows/  CI + Release
skills/          Agent knowledge base
docs/            Localized README bodies
```

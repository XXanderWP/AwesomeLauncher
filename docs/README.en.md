# AwesomeCraft Launcher (English)

## 1. For users

### What it is

Official desktop launcher for AwesomeCraft servers. Current pack: **Prominence™ II: Hasturian Era**.

### Downloads

Get the latest build from [GitHub Releases](https://github.com/XXanderWP/AwesomeLauncher/releases):

| File | Platform |
|------|----------|
| `AwesomeLauncher.exe` | Windows |
| `AwesomeLauncher.AppImage` | Linux |
| `AwesomeLauncher-arm64.dmg` / `AwesomeLauncher-x64.dmg` | macOS |

### macOS Gatekeeper

If macOS blocks the app, open `QUARANTINE-README.txt` in the DMG and run:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

### Features

- Ely.by login (Microsoft / offline accounts are not supported)
- Automatic install of Java, Minecraft, Fabric/NeoForge, and pack files
- Separate user mods and verified pack mods
- Live server online status on the home screen
- Starts even when the pack file server is temporarily unavailable
- Settings: data folder, language (EN/RU/UK), Java memory, update mode
- File integrity verification without wiping your personal configs
- Real-time game logs and Stop Game button while Minecraft is running
- Built-in updater from GitHub Releases

### First launch

1. Sign in with Ely.by
2. Select a server
3. Press **Play** (first launch downloads the pack)
4. Adjust RAM / folder in **Settings** if needed

---

## 2. For developers

### Stack

Electron + TypeScript + React + helios-core + Jest + electron-builder.

### Setup

```bash
npm ci
npm run dev
```

### Quality gates

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

Coverage threshold: at least 60% for statements/lines/functions.

### Packaging

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

### CI/CD

- `ci.yml` on `main` / `beta` / `develop` (+ PRs)
- `release.yml` after successful CI on `main` (version-gated GitHub Release matrix)

### Agent docs

Read `AGENT.md` and keep `skills/*.md` + README translations up to date when behavior changes.

## License

MIT — see [LICENSE](../LICENSE).

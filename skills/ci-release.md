# CI/CD and packaging

## CI (`ci.yml`)

Triggers on push/PR to `main`, `beta`, `develop`.

Runs: install → prettier → eslint → typecheck → jest coverage.

## Release (`release.yml`)

Runs after successful CI on `main` (workflow_run) or manual dispatch.

1. Read `package.json` version
2. Skip if GitHub release `v{version}` already exists
3. Matrix build: Windows NSIS, Linux AppImage, macOS DMG (x64 + arm64)
4. Publish one GitHub Release with all artifacts
5. Delete temporary build artifacts

## Artifacts

Stable filenames (version lives in the GitHub release tag / URL):

- Windows: `AwesomeLauncher.exe`
- Linux: `AwesomeLauncher.AppImage`
- macOS DMG: `AwesomeLauncher-{arch}.dmg` (manual install)
- macOS ZIP: `AwesomeLauncher-{arch}.zip` (required by `electron-updater` / Squirrel.Mac when that path is used)

macOS packaging must include **both** `dmg` and `zip` targets when using Squirrel.Mac. DMG-only releases make `latest-mac.yml` list only `.dmg` files and auto-update fails with `ZIP file not provided`.

## macOS quarantine

DMG Finder view must include a visible text file (configured in `electron-builder.yml` → `dmg.contents`):

- File: `How to remove quarantine.txt` (from `resources/mac/QUARANTINE-README.txt`)

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

Keep app + Applications icons high in the DMG window; place the quarantine note lower. Dotfiles (`.background` / `.VolumeIcon.icns`) are system-hidden; taller window keeps them out of the primary composition if revealed.

## Auto-update

- Windows / Linux: `electron-updater` against GitHub Releases
- macOS: custom manual flow — check GitHub Releases API, then Install runs `osascript` with administrator privileges to download the arch DMG, replace the `.app`, clear `com.apple.quarantine`, and relaunch

Settings modes (Windows / Linux):

- auto download + install on quit
- auto download + manual install button

macOS UI hides auto modes and shows Check + Install (admin).
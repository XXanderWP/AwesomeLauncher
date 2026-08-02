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

- Windows: `AwesomeCraftLauncher-setup-{version}.exe`
- Linux: `AwesomeCraftLauncher-setup-{version}.AppImage`
- macOS: `AwesomeCraftLauncher-setup-{version}-{arch}.dmg`

## macOS quarantine

DMG includes `QUARANTINE-README.txt` with:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

## Auto-update

`electron-updater` provider: GitHub (`XXanderWP/AwesomeLauncher`).

Settings modes:

- auto download + install on quit
- auto download + manual install button

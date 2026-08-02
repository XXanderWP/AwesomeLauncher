# Tech stack and architecture

## License

MIT (`LICENSE`, also declared in `package.json`)

## Runtime

- Node 22+
- Electron (main/preload/renderer via electron-vite)
- React 19 + TypeScript

## Important scripts

- `npm run dev` — development
- `npm run build` — compile main/preload/renderer
- `npm test` — Jest with coverage thresholds (>= 60% lines/statements/functions)
- `npm run lint` / `npm run format`
- `npm run dist:win|mac|linux` — package installers

## Architecture

- `ConfigService` persists `config.json` in Electron `userData`
- Game files live in configurable `dataDirectory` (default `~/.awesomecraftlauncher` / `%APPDATA%/.awesomecraftlauncher`)
- `DistroService` loads Helios-compatible `distribution.json`
- `InstallService` uses helios-core `FullRepair` + Java discovery, then applies tracked file-sync rules (`syncRules`, `sync-index/`)
- `GameService` launches via legacy Fabric/Helios ProcessBuilder adapted for Ely.by (`authlib-injector`)
- `UpdaterService` uses `electron-updater` against GitHub Releases

## Design constraints

- Dark modern UI, border-radius 5px max
- Multi-server ready list UI
- Server list title uses live MOTD (`description`) from status ping, cached in `config.cachedServerNames` when offline
- Server row also shows distro pack name (e.g. `Prominence™ II: Hasturian Era`) under the live title when they differ
- Real-time game logs + kill button while game runs
- Compact `btn-sm` for logout / instance actions / running-game controls
- Shared Java defaults in Settings; per-server overrides from Home
- RAM inputs use slider + numeric field with validation against system memory
- macOS DMG must include `How to remove quarantine.txt` via `dmg.contents` (not only app extraFiles)

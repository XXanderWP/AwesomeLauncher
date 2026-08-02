# Tech stack and architecture

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
- `InstallService` uses helios-core `FullRepair` + Java discovery, then restores preserved player configs
- `GameService` launches via legacy Fabric/Helios ProcessBuilder adapted for Ely.by (`authlib-injector`)
- `UpdaterService` uses `electron-updater` against GitHub Releases

## Design constraints

- Dark modern UI, border-radius 5px max
- Multi-server ready list UI
- Real-time game logs + kill button while game runs

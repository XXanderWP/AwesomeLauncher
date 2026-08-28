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
- `npm run locator:build -- --legacy-fml <jar> --legacy-spi <jar> --modern-loader <jar>` — rebuild bundled NeoForge locator JARs
- `npm test` — Jest with coverage thresholds (>= 60% lines/statements/functions)
- `npm run lint` / `npm run format`
- `npm run dist:win|mac|linux` — package installers

## Architecture

- `ConfigService` persists `config.json` in Electron `userData`
- Game files live in configurable `dataDirectory` (default `~/.awesomelauncher` / `%APPDATA%\.awesomelauncher`)
- `config.json` tracks local instances in `instances.{serverId}`. Existing folders are migrated as `archive: true`; archived files are never removed automatically and remain visible for manual deletion.
- Archived instances can still be launched from a stored pack snapshot (`sync-index/{serverId}.distro.json`). Play is yellow and autoconnect is always off, including when the game setting is enabled.
- Launcher boot is independent of distribution loading: the UI opens first, while the remote server list refreshes in the background so an unavailable file server cannot keep the splash screen open indefinitely.
- On first launch with an empty data dir, offers one-time reuse of legacy Helios folder (`.helioslauncher`)
- `DistroService` loads Helios-compatible `distribution.json`
- `InstallService` uses helios-core `FullRepair` + Java discovery, then applies tracked file-sync rules (`syncRules`, `sync-index/`)
- `GameService` launches via legacy Fabric/Helios ProcessBuilder adapted for Ely.by (`authlib-injector`)
- `UpdaterService` uses `electron-updater` on Windows/Linux; macOS uses a privileged manual DMG replace (`osascript` + `xattr`) because the app is unsigned

## Design constraints

- Dark modern UI, border-radius 5px max
- Multi-server ready list UI
- Server list title uses live MOTD (`description`) from status ping, cached in `config.cachedServerNames` when offline
- Server row also shows distro pack name (e.g. `Prominence™ II: Hasturian Era`) under the live title when they differ
- Real-time game logs + kill button while game runs
- Compact `btn-sm` for logout / instance actions / running-game controls
- Per-server **Mods** modal: user `instance/mods/` (toggle/delete) and distribution-managed `common/mods/<loader>/` pack mods (read-only)
- `scripts/patch-helios-core.cjs` applies the narrowly version-guarded helios-core 2.3 path extension after install (`NeoForgeMod`, centralized ForgeMod); review it when upgrading helios-core
- Shared Java defaults in Settings; per-server overrides from Home
- RAM inputs use slider + numeric field with validation against system memory
- Linux Settings can install a user `.desktop` shortcut + icon for KDE/GNOME app menus
- macOS DMG must include `How to remove quarantine.txt` via `dmg.contents` (not only app extraFiles)
- Discord Rich Presence (`DiscordPresenceService`, client id in service): launcher / in-game / on-server states; toggle `settings.launcher.discordRichPresence` (default on)
- Prominence in-game RPC comes from mods `sdrp` + `prominent_talents` (`📍 biome, dim` + `Level N | M Item Level`). Launcher mirrors it by enabling SDRP `logState` and parsing `Sent state to discord:` from game logs (`prominencePresence.ts`)
- Custom protocol `awesomelauncher://launch/<serverId>` (single-instance); Discord join button uses HTTPS bridge `resources/web/join.html` hosted at files CDN

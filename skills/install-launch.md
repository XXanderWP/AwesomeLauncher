# Install, integrity, and launch

## Distribution

Remote index: `https://files.awesome-craft.ru/launcher/distribution.json`

Current server example:

- id: `Prominence`
- name: `Prominence™ II: Hasturian Era`
- address: `play.awesome-craft.ru`
- Minecraft: `1.20.1` (Fabric)

## Install pipeline

1. Ensure Java matching server `javaOptions.supported` (download Adoptium/OpenJDK via helios-core if needed)
2. `FullRepair.verifyFiles` + `download` for missing/corrupt assets
3. Restore player-mutable files from backup (see below)
4. Load vanilla + Fabric version JSON
5. Spawn ProcessBuilder

## Config preservation (critical)

Old Helios-based launcher overwrote File modules whenever MD5 differed, resetting player configs every launch.

New launcher:

- Before repair, backup mutable paths if `preservePlayerConfigs` is enabled (default true)
- After repair, restore backup
- Mutable paths include `options.txt`, `servers.dat*`, `config/**` (except forced pack defaults like `config/yosbr/`), minimap data, saves, screenshots, logs

Integrity verification still validates mods/libraries/assets.

## Game session UX

While running:

- Stream stdout/stderr to UI logs view
- Provide kill/stop control from launcher

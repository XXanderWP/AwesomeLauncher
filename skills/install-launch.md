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
2. Backup protected local instance files (`config/**`, `options*.txt`, user `mods/**`) when `preservePlayerConfigs` is enabled
3. `FullRepair.verifyFiles` + `download` — missing files are always fetched; changed files in non-config folders are updated
4. Restore protected backups; purge any new jars that FullRepair dropped into instance `mods/`
5. Orphan cleanup using persisted server file index (`{dataDir}/sync-index/{serverId}.json`)
6. Save the current distribution file list as the tracked set
7. Load vanilla + Fabric version JSON and spawn ProcessBuilder

## File sync rules

| Rule | Behavior |
|------|----------|
| Missing locally | Always download |
| Removed from remote | Delete locally **only if** the path was previously tracked as server-managed |
| Never tracked locally | Leave alone (player-added files stay) |
| `logs/`, `saves/` | Full immunity — sync never walks, restores, or deletes |
| Instance `mods/` | User mods — never synced; protect + purge forced installs |
| `config/` | Download if missing; **do not** overwrite when already present |
| Other folders (`resourcepacks`, `shaderpacks`, `datapacks`, `common/mods`, …) | Re-download when remote hash changes |
| `options.txt`, `optionsshaders.txt`, `optionshaders.txt` | Never overwrite when present |

Tracked paths live in `sync-index/{serverId}.json` under the game data directory. On the first run after this feature, the index is created without deleting anything (no prior baseline).

Integrity verification still validates mods/libraries/assets under `common/`.

## Game session UX

While running:

- Stream stdout/stderr to UI logs view
- Provide kill/stop control from launcher

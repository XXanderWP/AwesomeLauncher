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
| `config/` | Download if missing; **do not** overwrite when already present (except pack metadata like `config/crash_assistant/modlist.json`) |
| Other folders (`resourcepacks`, `shaderpacks`, `datapacks`, `common/mods`, …) | Re-download when remote hash changes |
| `options.txt`, `optionsshaders.txt`, `optionshaders.txt` | Never overwrite when present |

Tracked paths live in `sync-index/{serverId}.json` under the game data directory. On the first run after this feature, the index is created without deleting anything (no prior baseline).

Integrity verification still validates mods/libraries/assets under `common/`.

## Natives extraction

LWJGL/OpenGL natives are unzipped into a temp natives directory **synchronously** before spawn.

Destination file names use `path.basename(entry)` only. Using a zip entry path that starts with `/`
makes Node `path.join` discard the natives directory on Linux and write to the filesystem root
(or fail), which then crashes Minecraft with `SIGSEGV` in `org.lwjgl.system.JNI`.

## Linux NVIDIA / GLFW

On Linux Minecraft is spawned with a **whitelisted** environment (not a full copy of the
launcher/`process.env`). That drops AppImage/Cursor/`ELECTRON_*`/`APPDIR` pollution and
forces:

- `__GL_THREADED_OPTIMIZATIONS=0`
- `GLFW_PLATFORM=x11`, `GDK_BACKEND=x11`, `XDG_SESSION_TYPE=x11`, `QT_QPA_PLATFORM=xcb`
- no `WAYLAND_DISPLAY`
- sanitized `PATH` / `LD_LIBRARY_PATH` (no `/.mount_*`)

Without this, NVIDIA (esp. under Wayland/XWayland) often SIGSEGVs in
`glfwWaitEventsTimeout` / `org.lwjgl.system.JNI`. The same crash appears from the old
AwesomeCraft AppImage when its mount `LD_LIBRARY_PATH` reaches the JVM.

Each launch writes `instances/<id>/.launcher-env.log` and prints
`[ProcessBuilder] Linux GL env: ...` to the terminal.

Launch helpers are copied to `out/launch/` on `dev`/`build`/`preview`. Restart the launcher
after changing them — Electron caches `require()`.

## Game session UX

While running:

- Stream stdout/stderr to UI logs view
- Provide kill/stop control from launcher

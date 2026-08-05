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

On Linux, Minecraft gets a **whitelisted X11-oriented env** (not a full parent
clone). Clearing `LD_LIBRARY_PATH` alone is not enough for AppImage builds —

1. **Whitelist** session basics (`HOME`, `DISPLAY`, `XAUTHORITY`, `XDG_RUNTIME_DIR`,
   locales, …). Do **not** pass `APPDIR` / `APPIMAGE` / `ELECTRON_*` / `GTK_PATH` /
   `WAYLAND_DISPLAY`.
2. Force X11/GLX via XWayland: `XDG_SESSION_TYPE=x11`, `GDK_BACKEND=x11`,
   `GLFW_PLATFORM=x11`, `QT_QPA_PLATFORM=xcb`.
3. Set `__GL_THREADED_OPTIMIZATIONS=0` and `mesa_glthread=false`.
4. **Never** set `LD_LIBRARY_PATH` / `LD_PRELOAD` for the JVM. Use a **fixed**
   child `PATH` (`/usr/local/bin:/usr/bin:/bin`) — do not inherit nvm /
   AppImage / `node_modules` PATH. Host PATH differences are not what makes
   `npm run start` more reliable than AppImage.
5. Before spawn, run a short **system GLX warm-up** (`glxinfo -B`, else
   `nvidia-smi -L`) under the same clean `env -i` environment. Cold boot +
   AppImage Electron (bundled libs) can leave NVIDIA/XWayland unready; the
   first Minecraft launch then `SIGSEGV` in `glfwWaitEventsTimeout`. A prior
   successful `npm` launch appears to “fix” AppImage for the same reason
   (GPU already warmed), not because of PATH.

Host sanitizer only removes *foreign* mounts from the Electron process itself
(keeps this app’s `APPDIR` so packaged Electron helpers keep working).

Without the whitelist, AppImage launches still `SIGSEGV` in
`glfwWaitEventsTimeout` after the title screen even with `LD_LIBRARY_PATH`
cleared; `npm run start` often survives because it has no AppImage mount vars
*and* uses system OpenGL in the Electron parent (which also warms the driver).

Default JVM options match Helios Java 17 (short G1 set), not Aikar server flags.
Existing `config.json` `jvmOptions` are kept until the user resets them — GC flags
do not cause the GLFW SIGSEGV.

Each launch writes a short `instances/<id>/.launcher-env.log` (including warm-up
result) and prints `[ProcessBuilder] Linux GL env: ...`.

## Game session UX

While running:

- Stream stdout/stderr to UI logs view
- Provide kill/stop control from launcher

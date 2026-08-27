# Backend and remote resources

## AwesomeCraft file server

- Distribution: `https://files.awesome-craft.ru/launcher/distribution.json`
- News RSS: `https://files.awesome-craft.ru/launcher/news.rss`
- Pack assets under `/launcher/servers/{serverFolder}/...`
- Maven-like libs under `/launcher/repo/...`

## Game server

- Host: `play.awesome-craft.ru` (default port 25565)
- Status probed with Minecraft modern status protocol via helios-core `getServerStatus`

## Auth / skins

- Auth: `https://authserver.ely.by`
- Skins: `https://skinsystem.ely.by/skins/{name}.png`

## Local data layout

Default `dataDirectory`:

- Linux / macOS: `~/.awesomelauncher`
- Windows: `%APPDATA%\.awesomelauncher`

Legacy AwesomeCraftLauncher (Helios) default (one-time reuse offer when new dir is empty):

- Linux: `~/.helioslauncher`
- Windows: `%APPDATA%\.helioslauncher`
- macOS: `~/Library/Application Support/.helioslauncher`

```
{dataDirectory}/
  common/
    libraries/            # loader and game libraries
    assets/               # Mojang assets
    versions/             # version manifests and client jars
    mods/fabric/           # distribution-managed Fabric mods
    mods/forge/            # distribution-managed Forge mods
    mods/neoforge/         # distribution-managed NeoForge mods
    mod-manifests/         # per-server NeoForge launch allow-lists
  instances/{serverId}/   # game directory; mods/ is user-owned
  java/          # managed runtimes (as created by helios-core)
```

Launcher config: `{userData}/config.json`

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

```
{dataDirectory}/
  common/        # libraries, assets, versions, mod store
  instances/{serverId}/  # game directory
  java/          # managed runtimes (as created by helios-core)
```

Launcher config: `{userData}/config.json`

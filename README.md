# AwesomeCraft Launcher

Cross-platform Minecraft launcher for AwesomeCraft projects.

## Documentation by language

| Language | File |
|----------|------|
| English | [docs/README.en.md](docs/README.en.md) |
| Русский | [docs/README.ru.md](docs/README.ru.md) |
| Українська | [docs/README.uk.md](docs/README.uk.md) |

Each localized document is split into:

1. **Users** — download, install, play, settings
2. **Developers** — stack, scripts, CI/CD, contributing

Distribution-managed mods are stored centrally under `common/mods/<loader>`.
The per-instance `mods/` directory is reserved for mods installed by the user.
Downloaded instances remain visible as archived when the distribution server is unavailable; the launcher never deletes them automatically. Archived instances can still be launched (yellow Play) without joining the game server.

## Quick links

- Releases: https://github.com/XXanderWP/AwesomeLauncher/releases
- Agent guide: [AGENT.md](AGENT.md)
- Skills: [skills/](skills/)
- License: [MIT](LICENSE)

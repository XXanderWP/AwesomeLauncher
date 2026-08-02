# AwesomeCraft Launcher (Русский)

## 1. Для пользователей

### Что это

Официальный десктопный лаунчер серверов AwesomeCraft. Текущая сборка: **Prominence™ II: Hasturian Era**.

### Загрузка

Свежие сборки: [GitHub Releases](https://github.com/XXanderWP/AwesomeLauncher/releases)

| Файл | Платформа |
|------|-----------|
| `AwesomeCraftLauncher-setup-*.exe` | Windows |
| `AwesomeCraftLauncher-setup-*.AppImage` | Linux |
| `AwesomeCraftLauncher-setup-*-arm64.dmg` / `*-x64.dmg` | macOS |

### macOS и карантин

Если macOS блокирует приложение, откройте `QUARANTINE-README.txt` в DMG и выполните:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

### Возможности

- Вход только через Ely.by
- Автоустановка Java, Minecraft, Fabric и файлов сборки
- Онлайн сервера на главном экране
- Настройки: папка данных, язык (EN/RU/UK), память Java, режим обновлений
- Проверка целостности без перезаписи ваших конфигов
- Логи игры в реальном времени и кнопка завершения игры
- Автообновление через GitHub Releases

### Первый запуск

1. Войдите через Ely.by
2. Выберите сервер
3. Нажмите **Играть**
4. При необходимости настройте RAM / папку в **Настройках**

---

## 2. Для разработчиков

### Стек

Electron + TypeScript + React + helios-core + Jest + electron-builder.

### Установка

```bash
npm ci
npm run dev
```

### Проверки качества

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

Порог покрытия: минимум 60% statements/lines/functions.

### Сборка дистрибутивов

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

### CI/CD

- `ci.yml` для веток `main` / `beta` / `develop` и PR
- `release.yml` после успешного CI на `main` (релиз по версии из `package.json`)

### Документация для агентов

Смотрите `AGENT.md`. При изменениях обновляйте `skills/*.md` и актуальные README.

## Лицензия

MIT — см. [LICENSE](../LICENSE).

# AwesomeCraft Launcher (Українська)

## 1. Для користувачів

### Що це

Офіційний десктопний лаунчер серверів AwesomeCraft. Поточна збірка: **Prominence™ II: Hasturian Era**.

### Завантаження

Актуальні збірки: [GitHub Releases](https://github.com/XXanderWP/AwesomeLauncher/releases)

| Файл | Платформа |
|------|-----------|
| `AwesomeCraftLauncher-setup-*.exe` | Windows |
| `AwesomeCraftLauncher-setup-*.AppImage` | Linux |
| `AwesomeCraftLauncher-setup-*-arm64.dmg` / `*-x64.dmg` | macOS |

### macOS і карантин

Якщо macOS блокує застосунок, відкрийте `QUARANTINE-README.txt` у DMG і виконайте:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

### Можливості

- Вхід лише через Ely.by
- Автоустановка Java, Minecraft, Fabric і файлів збірки
- Онлайн сервера на головному екрані
- Налаштування: папка даних, мова (EN/RU/UK), памʼять Java, режим оновлень
- Перевірка цілісності без перезапису ваших конфігів
- Логи гри в реальному часі та кнопка завершення гри
- Автооновлення через GitHub Releases

### Перший запуск

1. Увійдіть через Ely.by
2. Оберіть сервер
3. Натисніть **Грати**
4. За потреби налаштуйте RAM / папку в **Налаштуваннях**

---

## 2. Для розробників

### Стек

Electron + TypeScript + React + helios-core + Jest + electron-builder.

### Встановлення

```bash
npm ci
npm run dev
```

### Перевірки якості

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

Поріг покриття: мінімум 60% statements/lines/functions.

### Збірка дистрибутивів

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

### CI/CD

- `ci.yml` для гілок `main` / `beta` / `develop` і PR
- `release.yml` після успішного CI на `main` (реліз за версією з `package.json`)

### Документація для агентів

Дивіться `AGENT.md`. Після змін оновлюйте `skills/*.md` і README.

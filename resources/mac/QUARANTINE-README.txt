# How to remove macOS quarantine from AwesomeCraftLauncher

After downloading the DMG from GitHub Releases, macOS Gatekeeper may block the app
because it is not notarized. Use one of the methods below.

## Option A — Terminal (recommended)

1. Mount the DMG and drag AwesomeCraftLauncher.app into Applications (or any folder).
2. Open Terminal and run:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

If you installed the app elsewhere, replace the path with the real location, for example:

```bash
xattr -dr com.apple.quarantine "/Users/YOUR_NAME/Downloads/AwesomeCraftLauncher.app"
```

3. Launch the app normally.

## Option B — System Settings

1. Try to open the app once (it may be blocked).
2. Open System Settings → Privacy & Security.
3. Find the blocked-app message and click "Open Anyway".

## Русский

После скачивания DMG macOS может заблокировать приложение. Выполните в Терминале:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

## Українська

Після завантаження DMG macOS може заблокувати застосунок. Виконайте в Терміналі:

```bash
xattr -dr com.apple.quarantine "/Applications/AwesomeCraftLauncher.app"
```

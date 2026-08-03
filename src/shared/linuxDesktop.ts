/** FreeDesktop application id (matches electron-builder appId). */
export const LINUX_DESKTOP_ID = 'ru.awesomecraft.launcher'
export const LINUX_DESKTOP_FILENAME = `${LINUX_DESKTOP_ID}.desktop`
export const LINUX_ICON_FILENAME = `${LINUX_DESKTOP_ID}.png`

export interface LinuxDesktopEntryOptions {
  name: string
  comment: string
  execPath: string
  iconPath: string
  startupWmClass?: string
}

/** Quote a path for a Desktop Entry Exec= key when needed. */
export function quoteDesktopExec(execPath: string): string {
  if (!/[\s"\\$`>]/.test(execPath)) {
    return execPath
  }
  return `"${execPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildLinuxDesktopEntry(options: LinuxDesktopEntryOptions): string {
  const exec = quoteDesktopExec(options.execPath)
  const wmClass = options.startupWmClass || 'AwesomeCraftLauncher'
  return [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    `Name=${options.name}`,
    `Comment=${options.comment}`,
    `Exec=${exec} %U`,
    `Icon=${options.iconPath}`,
    'Terminal=false',
    'Categories=Game;',
    'StartupNotify=true',
    `StartupWMClass=${wmClass}`,
    'MimeType=x-scheme-handler/awesomelauncher;',
    ''
  ].join('\n')
}

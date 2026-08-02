import { app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import {
  LINUX_DESKTOP_FILENAME,
  LINUX_DESKTOP_ID,
  LINUX_ICON_FILENAME,
  buildLinuxDesktopEntry
} from '../../../shared/linuxDesktop'

const execFileAsync = promisify(execFile)

export interface LinuxShortcutStatus {
  supported: boolean
  installed: boolean
  desktopPath: string
  iconPath: string
  execPath: string
}

export function resolveLinuxExecPath(
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath
): string {
  const appImage = env.APPIMAGE?.trim()
  if (appImage) return appImage
  return execPath
}

export function linuxApplicationsDir(home = os.homedir()): string {
  return path.join(home, '.local', 'share', 'applications')
}

export function linuxIconsDir(home = os.homedir()): string {
  return path.join(home, '.local', 'share', 'icons', 'hicolor', '256x256', 'apps')
}

export function linuxDesktopFilePath(home = os.homedir()): string {
  return path.join(linuxApplicationsDir(home), LINUX_DESKTOP_FILENAME)
}

export function linuxIconFilePath(home = os.homedir()): string {
  return path.join(linuxIconsDir(home), LINUX_ICON_FILENAME)
}

export function resolveBundledIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png')
  }
  return path.join(process.cwd(), 'build', 'icon.png')
}

export async function getLinuxShortcutStatus(): Promise<LinuxShortcutStatus> {
  const supported = process.platform === 'linux'
  const desktopPath = linuxDesktopFilePath()
  const iconPath = linuxIconFilePath()
  const execPath = resolveLinuxExecPath()
  if (!supported) {
    return { supported, installed: false, desktopPath, iconPath, execPath }
  }
  const installed = await fs.pathExists(desktopPath)
  return { supported, installed, desktopPath, iconPath, execPath }
}

export async function installLinuxDesktopShortcut(): Promise<LinuxShortcutStatus> {
  if (process.platform !== 'linux') {
    throw new Error('Desktop shortcuts are only supported on Linux')
  }

  const execPath = resolveLinuxExecPath()
  const sourceIcon = resolveBundledIconPath()
  if (!(await fs.pathExists(sourceIcon))) {
    throw new Error(`Bundled icon not found: ${sourceIcon}`)
  }

  const desktopPath = linuxDesktopFilePath()
  const iconPath = linuxIconFilePath()

  await fs.ensureDir(path.dirname(desktopPath))
  await fs.ensureDir(path.dirname(iconPath))
  await fs.copy(sourceIcon, iconPath, { overwrite: true })

  const contents = buildLinuxDesktopEntry({
    name: 'AwesomeCraft Launcher',
    comment: 'Minecraft launcher for AwesomeCraft projects',
    execPath,
    iconPath,
    startupWmClass: 'AwesomeCraftLauncher'
  })
  await fs.writeFile(desktopPath, contents, { encoding: 'utf8', mode: 0o755 })

  await refreshDesktopDatabase(path.dirname(desktopPath))

  return getLinuxShortcutStatus()
}

export async function removeLinuxDesktopShortcut(): Promise<LinuxShortcutStatus> {
  if (process.platform !== 'linux') {
    throw new Error('Desktop shortcuts are only supported on Linux')
  }

  const desktopPath = linuxDesktopFilePath()
  const iconPath = linuxIconFilePath()
  await fs.remove(desktopPath)
  await fs.remove(iconPath)
  await refreshDesktopDatabase(path.dirname(desktopPath))
  return getLinuxShortcutStatus()
}

async function refreshDesktopDatabase(applicationsDir: string): Promise<void> {
  try {
    await execFileAsync('update-desktop-database', [applicationsDir], {
      timeout: 5000
    })
  } catch {
    // Optional helper; missing binary is fine on minimal desktops.
  }
}

export { LINUX_DESKTOP_ID }

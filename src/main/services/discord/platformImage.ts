import fs from 'fs'
import os from 'os'

export interface PlatformImage {
  key: string
  text: string
}

const getLinuxInfo = (): { name: string; version: string } => {
  try {
    const release = fs.readFileSync('/etc/os-release', 'utf-8')
    const get = (key: string): string => {
      const match = release.match(new RegExp(`^${key}="?([^"\n]+)"?`, 'm'))
      return match?.[1]?.trim() ?? ''
    }
    const name = get('NAME') || get('ID') || 'Linux'
    const version = get('VERSION') || get('VERSION_ID') || os.release()
    return { name, version }
  } catch {
    return { name: 'Linux', version: os.release() }
  }
}

const getMacOSVersion = (): string => {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    return execSync('sw_vers -productVersion', { encoding: 'utf-8' }).trim()
  } catch {
    return os.release()
  }
}

const getWindowsVersion = (): string => {
  const release = os.release()
  const build = parseInt(release.split('.')[2] ?? '0', 10)
  const name = build >= 22000 ? 'Windows 11' : 'Windows 10'
  return `${name} (build ${build})`
}

const getCustomIconByName = (name: string): string | undefined => {
  const lower = name.toLowerCase()
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return undefined
  }
  if (lower.includes('endeavouros')) return 'endeavouros'
  if (lower.includes('arch') || lower.includes('cachyos')) return 'arch'
  if (lower.includes('ubuntu')) return 'ubuntu'
  if (lower.includes('fedora')) return 'fedora'
  return undefined
}

/** Small Discord asset key + hover text for the current OS (same keys as ProxyBridge). */
export function getPlatformImage(): PlatformImage {
  switch (process.platform) {
    case 'win32': {
      const version = getWindowsVersion()
      return { key: getCustomIconByName(version) || 'windows', text: version }
    }
    case 'darwin': {
      const version = getMacOSVersion()
      return { key: getCustomIconByName(version) || 'macos', text: `macOS ${version}` }
    }
    default: {
      const { name, version } = getLinuxInfo()
      return {
        key: getCustomIconByName(`${name} ${version}`) || 'linux',
        text: `${name} ${version}`
      }
    }
  }
}

/** Flatpak/Snap Discord IPC symlink helper (Linux). */
export function ensureLinuxIpcSocket(): void {
  if (process.platform !== 'linux') return

  const uid = os.userInfo().uid
  const candidates = [`/run/user/${uid}`, `/tmp`]
  const current = process.env.XDG_RUNTIME_DIR
  if (!current || !fs.existsSync(current)) {
    const fallback = candidates.find((p) => fs.existsSync(p))
    if (fallback) {
      process.env.XDG_RUNTIME_DIR = fallback
      console.log(`[DiscordRPC] XDG_RUNTIME_DIR set to: ${fallback}`)
    }
  }

  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`
  const targetSocket = `${runtimeDir}/discord-ipc-0`
  const flatpakSocket = `${runtimeDir}/app/com.discordapp.Discord/discord-ipc-0`
  const snapSocket = `${runtimeDir}/snap.discord/discord-ipc-0`

  if (!fs.existsSync(targetSocket)) {
    const source = [flatpakSocket, snapSocket].find((p) => fs.existsSync(p))
    if (source) {
      try {
        fs.symlinkSync(source, targetSocket)
        console.log(`[DiscordRPC] Created symlink: ${targetSocket} → ${source}`)
      } catch (e) {
        console.log(`[DiscordRPC] Symlink already exists or failed: ${e}`)
      }
    }
  }
}

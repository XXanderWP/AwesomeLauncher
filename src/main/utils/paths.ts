import os from 'os'
import path from 'path'
import { DEFAULT_DATA_DIR_NAME } from '../../shared/types'

/**
 * Default game data directory:
 * - Unix-like (Linux/macOS): ~/.awesomelauncher
 * - Windows: %APPDATA%\.awesomelauncher
 */
export function defaultDataDirectory(): string {
  if (process.platform === 'win32') {
    const root = process.env.APPDATA || os.homedir()
    return path.join(root, DEFAULT_DATA_DIR_NAME)
  }
  return path.join(os.homedir(), DEFAULT_DATA_DIR_NAME)
}

export function commonDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, 'common')
}

export function instancesDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, 'instances')
}

export function instanceDirectory(dataDirectory: string, serverId: string): string {
  return path.join(instancesDirectory(dataDirectory), serverId)
}

export function javaDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, 'java')
}

export function parseHostPort(
  address: string,
  defaultPort = 25565
): { host: string; port: number } {
  if (!address) {
    return { host: 'localhost', port: defaultPort }
  }
  if (address.startsWith('[')) {
    const end = address.indexOf(']')
    if (end > 0) {
      const host = address.slice(1, end)
      const rest = address.slice(end + 1)
      if (rest.startsWith(':')) {
        const port = Number.parseInt(rest.slice(1), 10)
        return { host, port: Number.isFinite(port) ? port : defaultPort }
      }
      return { host, port: defaultPort }
    }
  }
  const idx = address.lastIndexOf(':')
  if (idx > 0 && address.indexOf(':') === idx) {
    const host = address.slice(0, idx)
    const port = Number.parseInt(address.slice(idx + 1), 10)
    return { host, port: Number.isFinite(port) ? port : defaultPort }
  }
  return { host: address, port: defaultPort }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

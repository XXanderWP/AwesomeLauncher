import fs from 'fs-extra'
import path from 'path'
import { HeliosDistribution } from 'helios-core/common'
import type { DistroServerSummary } from '../../../shared/types'
import { parseHostPort } from '../../utils/paths'

export const SERVER_SNAPSHOT_VERSION = 1

export interface ServerLaunchSnapshot {
  version: number
  serverId: string
  capturedAt: number
  summary: DistroServerSummary
  rawServer: Record<string, unknown>
}

export function serverSnapshotPath(dataDirectory: string, serverId: string): string {
  return path.join(dataDirectory, 'sync-index', `${serverId}.distro.json`)
}

export function summaryFromDistroServer(server: {
  rawServer?: Record<string, any>
  port?: number
  [key: string]: unknown
}): DistroServerSummary {
  const raw = server.rawServer || server
  const address = raw.address || 'localhost'
  const { host, port } = parseHostPort(address)
  const java = raw.javaOptions || {
    supported: '>=17 <18',
    suggestedMajor: 17,
    ram: { minimum: 4096, recommended: 8192 }
  }
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    icon: raw.icon || '',
    version: raw.version || '',
    address: host,
    port: server.port || port,
    minecraftVersion: raw.minecraftVersion,
    mainServer: Boolean(raw.mainServer),
    autoconnect: Boolean(raw.autoconnect),
    java: {
      supported: java.supported || '>=17',
      suggestedMajor: java.suggestedMajor || 17,
      ram: {
        minimum: java.ram?.minimum || 4096,
        recommended: java.ram?.recommended || 8192
      }
    }
  }
}

export function shouldAutoconnectOnLaunch(archived: boolean, distroAutoconnect: boolean): boolean {
  return !archived && distroAutoconnect
}

export function heliosDistributionFromRawServer(
  rawServer: Record<string, unknown>,
  commonDir: string,
  instanceDir: string
): HeliosDistribution {
  return new HeliosDistribution(
    {
      version: '1.0.0',
      rss: '',
      servers: [
        {
          ...rawServer,
          autoconnect: false,
          mainServer: false
        } as any
      ]
    },
    commonDir,
    instanceDir
  )
}

export async function saveServerSnapshot(
  dataDirectory: string,
  rawServer: Record<string, any>,
  summary: DistroServerSummary
): Promise<void> {
  const serverId = rawServer.id || summary.id
  if (!serverId) return
  const file = serverSnapshotPath(dataDirectory, serverId)
  await fs.ensureDir(path.dirname(file))
  const snapshot: ServerLaunchSnapshot = {
    version: SERVER_SNAPSHOT_VERSION,
    serverId,
    capturedAt: Date.now(),
    summary,
    rawServer
  }
  await fs.writeJson(file, snapshot, { spaces: 2 })
}

export async function loadServerSnapshot(
  dataDirectory: string,
  serverId: string
): Promise<ServerLaunchSnapshot | null> {
  const file = serverSnapshotPath(dataDirectory, serverId)
  if (!(await fs.pathExists(file))) {
    return null
  }
  try {
    const raw = (await fs.readJson(file)) as ServerLaunchSnapshot
    if (!raw?.rawServer || !raw.summary?.id) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

export async function deleteServerSnapshot(dataDirectory: string, serverId: string): Promise<void> {
  await fs.remove(serverSnapshotPath(dataDirectory, serverId))
}

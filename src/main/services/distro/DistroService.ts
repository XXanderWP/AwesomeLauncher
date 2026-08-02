import { app } from 'electron'
import { DistributionAPI } from 'helios-core/common'
import type { DistroServerSummary } from '../../../shared/types'
import { DISTRO_URL } from '../../../shared/types'
import { parseHostPort, commonDirectory, instancesDirectory } from '../../utils/paths'
import type { ConfigService } from '../config/ConfigService'

export class DistroService {
  private api: DistributionAPI | null = null
  private lastRaw: any = null

  constructor(private readonly config: ConfigService) {}

  private createApi(): DistributionAPI {
    const dataDir = this.config.getDataDirectory()
    return new DistributionAPI(
      app.getPath('userData'),
      commonDirectory(dataDir),
      instancesDirectory(dataDir),
      DISTRO_URL,
      false
    )
  }

  private getApi(): DistributionAPI {
    if (!this.api) {
      this.api = this.createApi()
    }
    return this.api
  }

  invalidate(): void {
    this.api = null
  }

  async refresh(): Promise<{ servers: DistroServerSummary[]; raw: any }> {
    this.invalidate()
    const distro = await this.getApi().refreshDistributionOrFallback()
    this.lastRaw = distro
    return { servers: this.toSummaries(distro), raw: distro }
  }

  async get(): Promise<{ servers: DistroServerSummary[]; raw: any }> {
    if (this.lastRaw) {
      return { servers: this.toSummaries(this.lastRaw), raw: this.lastRaw }
    }
    try {
      const distro = await this.getApi().getDistributionLocalLoadOnly()
      this.lastRaw = distro
      return { servers: this.toSummaries(distro), raw: distro }
    } catch {
      return this.refresh()
    }
  }

  getHeliosDistribution(): any {
    return this.lastRaw
  }

  getApiInstance(): DistributionAPI {
    return this.getApi()
  }

  private toSummaries(distro: any): DistroServerSummary[] {
    const servers: any[] = distro?.servers || []
    return servers.map((server) => {
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
    })
  }
}

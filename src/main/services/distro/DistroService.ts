import { app } from 'electron'
import { DistributionAPI } from 'helios-core/common'
import type { DistroServerSummary } from '../../../shared/types'
import { DISTRO_URL } from '../../../shared/types'
import { commonDirectory, instancesDirectory } from '../../utils/paths'
import type { ConfigService } from '../config/ConfigService'
import { saveServerSnapshot, summaryFromDistroServer } from './serverSnapshot'

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
    await this.persistServerSnapshots(distro)
    return { servers: this.toSummaries(distro), raw: distro }
  }

  async get(): Promise<{ servers: DistroServerSummary[]; raw: any }> {
    if (this.lastRaw) {
      return { servers: this.toSummaries(this.lastRaw), raw: this.lastRaw }
    }
    try {
      const distro = await this.getApi().getDistributionLocalLoadOnly()
      this.lastRaw = distro
      await this.persistServerSnapshots(distro)
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
    return servers.map((server) => summaryFromDistroServer(server))
  }

  private async persistServerSnapshots(distro: any): Promise<void> {
    const dataDir = this.config.getDataDirectory()
    const servers: any[] = distro?.servers || []
    try {
      await Promise.all(
        servers.map((server) => {
          const raw = server.rawServer || server
          if (!raw?.id) return Promise.resolve()
          return saveServerSnapshot(dataDir, raw, summaryFromDistroServer(server))
        })
      )
    } catch (err) {
      console.warn(
        '[DistroService] Failed to persist instance launch snapshots:',
        err instanceof Error ? err.message : String(err)
      )
    }
  }
}

import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { FullRepair, MojangIndexProcessor, DistributionIndexProcessor } from 'helios-core/dl'
import {
  discoverBestJvmInstallation,
  latestOpenJDK,
  extractJdk,
  javaExecFromRoot
} from 'helios-core/java'
import type { JavaServerSettings, ProgressEvent } from '../../../shared/types'
import { IPC } from '../../../shared/types'
import { commonDirectory, instanceDirectory, instancesDirectory } from '../../utils/paths'
import { heliosDistributionFromRawServer, loadServerSnapshot } from '../distro/serverSnapshot'
import type { ConfigService } from '../config/ConfigService'
import type { DistroService } from '../distro/DistroService'
import { backupPreservedFiles, restorePreservedFiles, vacatePreservedFiles } from './preserveBackup'
import {
  findDistributionUserModsPaths,
  finalizeFileSync,
  migrateLegacyPackMods,
  runWithUserModsOmittedFromDistroCache
} from './fileSync'

export interface InstallResult {
  versionData: any
  modLoaderData: any
  server: any
  javaPath: string
}

export class InstallService {
  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService
  ) {}

  private emitProgress(payload: ProgressEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_PROGRESS, payload)
    }
  }

  async ensureJava(
    serverId: string,
    semverRange = '>=17 <18',
    suggestedMajor = 17
  ): Promise<string> {
    const javaSettings = this.config.getJavaSettings(serverId)
    if (javaSettings.javaPath && (await fs.pathExists(javaSettings.javaPath))) {
      return javaSettings.javaPath
    }

    this.emitProgress({
      phase: 'java',
      percent: 0,
      message: 'Scanning for Java'
    })

    const dataDir = this.config.getDataDirectory()
    const discovered = await discoverBestJvmInstallation(dataDir, semverRange)
    if (discovered?.path) {
      const exec = javaExecFromRoot(discovered.path)
      await this.persistJavaPath(serverId, javaSettings, exec)
      return exec
    }

    this.emitProgress({
      phase: 'java',
      percent: 5,
      message: 'Downloading Java runtime'
    })

    const asset = await latestOpenJDK(suggestedMajor, dataDir)
    if (!asset) {
      throw new Error(`Unable to find a downloadable JDK for Java ${suggestedMajor}`)
    }

    const { downloadFile } = require('helios-core/dl')
    const { validateLocalFile } = require('helios-core/common')
    await downloadFile(asset.url, asset.path, ({ transferred }: { transferred: number }) => {
      const percent = asset.size ? Math.min(95, Math.trunc((transferred / asset.size) * 100)) : 50
      this.emitProgress({
        phase: 'java',
        percent,
        message: 'Downloading Java runtime',
        detail: asset.id
      })
    })

    if (!(await validateLocalFile(asset.path, asset.algo, asset.hash))) {
      throw new Error('Downloaded JDK failed integrity validation')
    }

    this.emitProgress({ phase: 'java', percent: 96, message: 'Extracting Java runtime' })
    const exec = await extractJdk(asset.path)
    if (!exec) {
      throw new Error('Failed to extract JDK')
    }
    await this.persistJavaPath(serverId, javaSettings, exec)
    this.emitProgress({ phase: 'java', percent: 100, message: 'Java ready' })
    return exec
  }

  /** Save discovered Java into the override when custom, otherwise into shared defaults. */
  private async persistJavaPath(
    serverId: string,
    javaSettings: JavaServerSettings,
    exec: string
  ): Promise<void> {
    if (this.config.hasJavaOverride(serverId)) {
      await this.config.setJavaSettings(serverId, { ...javaSettings, javaPath: exec })
      return
    }
    await this.config.setJavaDefaults({ ...this.config.getJavaDefaults(), javaPath: exec })
  }

  async verifyAndRepair(serverId: string): Promise<{
    invalidFileCount: number
    restoredConfigs: number
    orphansRemoved: number
    trackedCount: number
  }> {
    const { raw: distro } = await this.distro.refresh()
    const server =
      distro.getServerById?.(serverId) ||
      distro.servers?.find((s: any) => (s.rawServer?.id || s.id) === serverId)
    if (!server) {
      throw new Error(`Server not found: ${serverId}`)
    }

    const dataDir = this.config.getDataDirectory()
    const commonDir = commonDirectory(dataDir)
    const instanceDir = instanceDirectory(dataDir, serverId)
    const launcherDir = path.dirname(this.config.path)

    await fs.ensureDir(commonDir)
    await fs.ensureDir(instanceDir)

    const ownedUserMods = findDistributionUserModsPaths(server, dataDir, serverId)
    if (ownedUserMods.length > 0) {
      const preview = ownedUserMods.slice(0, 5).join(', ')
      const extra = ownedUserMods.length > 5 ? ` (+${ownedUserMods.length - 5} more)` : ''
      console.warn(
        `[Install] Distribution still resolves ${ownedUserMods.length} module(s) into user-owned instance/mods (${preview}${extra}). Skipping FullRepair for those paths so player mods are not overwritten. Regenerate the distro with FabricMod/ForgeMod/NeoForgeMod.`
      )
    }
    await migrateLegacyPackMods(server, dataDir, serverId)

    const preserve = this.config.getPreservePlayerConfigs()
    const backup = await backupPreservedFiles(instanceDir, preserve)
    await vacatePreservedFiles(backup)

    const distroFile = path.join(
      launcherDir,
      this.distro.getApiInstance().isDevMode() ? 'distribution_dev.json' : 'distribution.json'
    )
    const fullRepair = new FullRepair(
      commonDir,
      instancesDirectory(dataDir),
      launcherDir,
      serverId,
      this.distro.getApiInstance().isDevMode()
    )

    fullRepair.spawnReceiver()

    let restoredConfigs = 0
    try {
      this.emitProgress({
        phase: 'validate',
        percent: 0,
        message: 'Validating file integrity'
      })

      const { result: invalidFileCount } = await runWithUserModsOmittedFromDistroCache({
        distroFile,
        heliosDistribution: distro,
        dataDirectory: dataDir,
        serverId,
        action: async () => {
          const invalid = await fullRepair.verifyFiles((percent) => {
            this.emitProgress({
              phase: 'validate',
              percent,
              message: 'Validating file integrity'
            })
          })

          if (invalid > 0) {
            this.emitProgress({
              phase: 'download',
              percent: 0,
              message: `Downloading ${invalid} files`
            })
            await fullRepair.download((percent) => {
              this.emitProgress({
                phase: 'download',
                percent,
                message: 'Downloading game files'
              })
            })
          }

          return invalid
        }
      })

      restoredConfigs = await restorePreservedFiles(backup)

      const syncStats = await finalizeFileSync({
        dataDirectory: dataDir,
        serverId,
        server,
        distribution: distro,
        protectedRestored: restoredConfigs
      })

      this.emitProgress({
        phase: 'idle',
        percent: 100,
        message: 'Files ready'
      })
      return {
        invalidFileCount,
        restoredConfigs,
        orphansRemoved: syncStats.orphansRemoved,
        trackedCount: syncStats.trackedCount
      }
    } finally {
      if (restoredConfigs === 0 && backup.length > 0) {
        await restorePreservedFiles(backup)
      }
      // helios-core disconnects its receiver before rejecting a failed repair.
      // Its unconditional second disconnect would mask the original error with
      // ERR_IPC_DISCONNECTED.
      if (fullRepair.childProcess?.connected) {
        fullRepair.destroyReceiver()
      }
    }
  }

  async prepareLaunch(serverId: string): Promise<InstallResult> {
    const { servers, raw: distro } = await this.distro.get()
    const liveSummary = servers.find((s) => s.id === serverId)
    const liveServer =
      distro.getServerById?.(serverId) ||
      distro.servers?.find((s: any) => (s.rawServer?.id || s.id) === serverId)

    if (!liveSummary || !liveServer) {
      return this.prepareArchivedLaunch(serverId)
    }

    const suggestedMajor = liveSummary.java.suggestedMajor || 17
    const semverRange = liveSummary.java.supported || `>=${suggestedMajor} <${suggestedMajor + 1}`
    const javaPath = await this.ensureJava(serverId, semverRange, suggestedMajor)

    await this.verifyAndRepair(serverId)

    const { raw: repaired } = await this.distro.get()
    const server =
      repaired.getServerById?.(serverId) ||
      repaired.servers?.find((s: any) => (s.rawServer?.id || s.id) === serverId)
    if (!server) {
      throw new Error(`Server not found: ${serverId}`)
    }

    return this.loadLaunchIndexes(serverId, repaired, server, javaPath)
  }

  private async prepareArchivedLaunch(serverId: string): Promise<InstallResult> {
    const dataDir = this.config.getDataDirectory()
    const snapshot = await loadServerSnapshot(dataDir, serverId)
    if (!snapshot) {
      throw new Error(`Archived instance cannot be launched: missing pack metadata for ${serverId}`)
    }

    const suggestedMajor = snapshot.summary.java.suggestedMajor || 17
    const semverRange =
      snapshot.summary.java.supported || `>=${suggestedMajor} <${suggestedMajor + 1}`
    const javaPath = await this.ensureJava(serverId, semverRange, suggestedMajor)

    this.emitProgress({
      phase: 'launch',
      percent: 0,
      message: 'Preparing archived instance'
    })

    const distro = heliosDistributionFromRawServer(
      snapshot.rawServer,
      commonDirectory(dataDir),
      instancesDirectory(dataDir)
    )
    const server = distro.getServerById(serverId)
    if (!server) {
      throw new Error(`Archived instance cannot be launched: invalid pack metadata for ${serverId}`)
    }

    return this.loadLaunchIndexes(serverId, distro, server, javaPath)
  }

  private async loadLaunchIndexes(
    serverId: string,
    distro: any,
    server: any,
    javaPath: string
  ): Promise<InstallResult> {
    const dataDir = this.config.getDataDirectory()
    const commonDir = commonDirectory(dataDir)
    const raw = server.rawServer || server

    const mojangIndexProcessor = new MojangIndexProcessor(commonDir, raw.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(commonDir, distro, serverId)

    await mojangIndexProcessor.init()
    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson()
    const versionData = await mojangIndexProcessor.getVersionJson()

    return {
      versionData,
      modLoaderData,
      server,
      javaPath
    }
  }
}

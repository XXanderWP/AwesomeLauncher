import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import type {
  AppConfig,
  ElybyAccount,
  JavaServerSettings,
  LanguageSetting,
  UpdateMode
} from '../../../shared/types'
import { createClientToken } from '../auth/elybyAuth'
import { defaultDataDirectory } from '../../utils/paths'

const CONFIG_VERSION = 2

const DEFAULT_JVM_OPTIONS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1',
  '-Dusing.aikars.flags=https://mcflags.emc.gs',
  '-Daikars.new.flags=true'
]

export function buildDefaultJavaSettings(
  defaults?: Partial<JavaServerSettings>
): JavaServerSettings {
  return {
    minRamMb: defaults?.minRamMb ?? 4096,
    maxRamMb: defaults?.maxRamMb ?? 8192,
    javaPath: defaults?.javaPath ?? null,
    jvmOptions: defaults?.jvmOptions ?? [...DEFAULT_JVM_OPTIONS]
  }
}

function buildDefaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    clientToken: createClientToken(),
    selectedServerId: null,
    selectedAccountUuid: null,
    accounts: {},
    settings: {
      game: {
        resWidth: 1280,
        resHeight: 720,
        fullscreen: false,
        autoConnect: true,
        launchDetached: false
      },
      launcher: {
        dataDirectory: defaultDataDirectory(),
        language: 'system',
        updateMode: 'auto-download-manual-install',
        allowPrerelease: false,
        preservePlayerConfigs: true
      }
    },
    javaDefaults: buildDefaultJavaSettings(),
    javaByServer: {}
  }
}

export class ConfigService {
  private config: AppConfig
  private readonly configPath: string

  constructor(userDataPath = app.getPath('userData')) {
    this.configPath = path.join(userDataPath, 'config.json')
    this.config = buildDefaultConfig()
  }

  get path(): string {
    return this.configPath
  }

  async load(): Promise<AppConfig> {
    if (await fs.pathExists(this.configPath)) {
      try {
        const raw = await fs.readJson(this.configPath)
        this.config = this.mergeWithDefaults(raw)
      } catch {
        this.config = buildDefaultConfig()
        await this.save()
      }
    } else {
      this.config = buildDefaultConfig()
      await this.save()
    }
    await fs.ensureDir(this.config.settings.launcher.dataDirectory)
    return this.get()
  }

  get(): AppConfig {
    return structuredClone(this.config)
  }

  async save(): Promise<void> {
    await fs.ensureDir(path.dirname(this.configPath))
    await fs.writeJson(this.configPath, this.config, { spaces: 2 })
  }

  async update(partial: DeepPartial<AppConfig>): Promise<AppConfig> {
    this.config = deepMerge(
      this.config as unknown as Record<string, unknown>,
      partial as DeepPartial<Record<string, unknown>>
    ) as unknown as AppConfig
    if (!this.config.clientToken) {
      this.config.clientToken = createClientToken()
    }
    if (!this.config.javaDefaults) {
      this.config.javaDefaults = buildDefaultJavaSettings()
    }
    await this.save()
    return this.get()
  }

  getDataDirectory(): string {
    return this.config.settings.launcher.dataDirectory
  }

  getSelectedAccount(): ElybyAccount | null {
    const uuid = this.config.selectedAccountUuid
    if (!uuid) return null
    return this.config.accounts[uuid] ?? null
  }

  async setAccount(account: ElybyAccount, select = true): Promise<AppConfig> {
    this.config.accounts[account.uuid] = account
    if (select) {
      this.config.selectedAccountUuid = account.uuid
    }
    await this.save()
    return this.get()
  }

  async removeAccount(uuid: string): Promise<AppConfig> {
    delete this.config.accounts[uuid]
    if (this.config.selectedAccountUuid === uuid) {
      const next = Object.keys(this.config.accounts)[0] ?? null
      this.config.selectedAccountUuid = next
    }
    await this.save()
    return this.get()
  }

  getJavaDefaults(): JavaServerSettings {
    return { ...(this.config.javaDefaults || buildDefaultJavaSettings()) }
  }

  /**
   * Effective Java settings for a server = defaults merged with optional override.
   */
  getJavaSettings(
    serverId: string,
    packDefaults?: Partial<JavaServerSettings>
  ): JavaServerSettings {
    const base = {
      ...buildDefaultJavaSettings(packDefaults),
      ...this.getJavaDefaults()
    }
    const override = this.config.javaByServer[serverId]
    return override ? { ...base, ...override } : base
  }

  hasJavaOverride(serverId: string): boolean {
    return Boolean(this.config.javaByServer[serverId])
  }

  async setJavaDefaults(settings: JavaServerSettings): Promise<AppConfig> {
    this.config.javaDefaults = settings
    await this.save()
    return this.get()
  }

  async setJavaSettings(serverId: string, settings: JavaServerSettings): Promise<AppConfig> {
    this.config.javaByServer[serverId] = settings
    await this.save()
    return this.get()
  }

  async clearJavaOverride(serverId: string): Promise<AppConfig> {
    delete this.config.javaByServer[serverId]
    await this.save()
    return this.get()
  }

  getLanguageSetting(): LanguageSetting {
    return this.config.settings.launcher.language
  }

  getUpdateMode(): UpdateMode {
    return this.config.settings.launcher.updateMode
  }

  getPreservePlayerConfigs(): boolean {
    return this.config.settings.launcher.preservePlayerConfigs !== false
  }

  private mergeWithDefaults(
    raw: Partial<AppConfig> & { javaDefaults?: JavaServerSettings }
  ): AppConfig {
    const merged = deepMerge(
      buildDefaultConfig() as unknown as Record<string, unknown>,
      raw as DeepPartial<Record<string, unknown>>
    ) as unknown as AppConfig

    if (!merged.javaDefaults) {
      // Migrate older configs that only had javaByServer entries.
      const firstOverride = Object.values(merged.javaByServer || {})[0]
      merged.javaDefaults = buildDefaultJavaSettings(firstOverride)
    }
    return merged
  }
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
  const output: Record<string, unknown> = { ...target }
  if (!isObject(source)) return output as T

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    const current = output[key]
    if (isObject(value) && isObject(current)) {
      output[key] = deepMerge(current, value as DeepPartial<Record<string, unknown>>)
    } else {
      output[key] = value
    }
  }
  return output as T
}

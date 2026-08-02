import fs from 'fs-extra'
import path from 'path'
import type { ConfigService } from '../config/ConfigService'
import type { DistroService } from '../distro/DistroService'
import { commonDirectory, instanceDirectory } from '../../utils/paths'
import type { ModInfo, ServerModsPayload } from '../../../shared/types'
import {
  disabledModPath,
  enabledModPath,
  isDisabledModFile,
  listModFilesInDirectory,
  readModMetadataFromJar
} from './modMetadata'

const MOD_TYPES = new Set(['FabricMod', 'ForgeMod', 'LiteMod', 'LiteLoader'])

export class ModsService {
  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService
  ) {}

  async listMods(serverId: string): Promise<ServerModsPayload> {
    const dataDir = this.config.getDataDirectory()
    const instanceModsDir = path.join(instanceDirectory(dataDir, serverId), 'mods')

    const userPaths = await listModFilesInDirectory(instanceModsDir)
    const userMods = await Promise.all(
      userPaths.map((filePath) => this.toModInfo(filePath, 'user'))
    )

    const commonMods = await this.listCommonMods(serverId, dataDir)

    return {
      serverId,
      userMods: userMods.sort((a, b) => a.name.localeCompare(b.name)),
      commonMods: commonMods.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  async setUserModEnabled(serverId: string, filePath: string, enabled: boolean): Promise<ModInfo> {
    const safePath = await this.assertUserModPath(serverId, filePath)
    const target = enabled ? enabledModPath(safePath) : disabledModPath(safePath)
    if (path.resolve(safePath) !== path.resolve(target)) {
      if (await fs.pathExists(target)) {
        throw new Error('A mod file with the target name already exists')
      }
      await fs.move(safePath, target)
    }
    return this.toModInfo(target, 'user')
  }

  async deleteUserMod(serverId: string, filePath: string): Promise<boolean> {
    const safePath = await this.assertUserModPath(serverId, filePath)
    await fs.remove(safePath)
    return true
  }

  private async listCommonMods(serverId: string, dataDir: string): Promise<ModInfo[]> {
    const { raw: distro } = await this.distro.get()
    const server =
      distro.getServerById?.(serverId) ||
      distro.servers?.find((s: any) => (s.rawServer?.id || s.id) === serverId)
    if (!server) {
      return []
    }

    const modules = this.collectModModules(server.modules || [])
    const commonRoot = path.resolve(commonDirectory(dataDir))
    const out: ModInfo[] = []
    const seen = new Set<string>()

    for (const mod of modules) {
      let absolutePath: string | null = null
      try {
        absolutePath = typeof mod.getPath === 'function' ? mod.getPath() : null
      } catch {
        absolutePath = null
      }
      if (!absolutePath || typeof absolutePath !== 'string') continue
      const resolved = path.resolve(absolutePath)
      if (!resolved.startsWith(commonRoot + path.sep) && resolved !== commonRoot) {
        continue
      }
      if (!(await fs.pathExists(resolved))) continue
      if (seen.has(resolved)) continue
      seen.add(resolved)
      out.push(await this.toModInfo(resolved, 'common'))
    }

    return out
  }

  private collectModModules(modules: any[]): any[] {
    const out: any[] = []
    const walk = (list: any[]): void => {
      for (const mod of list) {
        const type = mod.rawModule?.type || mod.type
        if (typeof type === 'string' && MOD_TYPES.has(type)) {
          out.push(mod)
        }
        const subs = mod.subModules
        if (Array.isArray(subs) && subs.length > 0) {
          walk(subs)
        }
      }
    }
    walk(modules)
    return out
  }

  private async toModInfo(filePath: string, source: 'user' | 'common'): Promise<ModInfo> {
    const meta = readModMetadataFromJar(filePath)
    const fileName = path.basename(filePath)
    return {
      id: meta.id,
      fileName,
      filePath,
      source,
      enabled: source === 'common' ? true : !isDisabledModFile(fileName),
      name: meta.name,
      version: meta.version,
      description: meta.description,
      authors: meta.authors,
      iconDataUrl: meta.iconDataUrl
    }
  }

  private async assertUserModPath(serverId: string, filePath: string): Promise<string> {
    if (typeof filePath !== 'string' || !filePath) {
      throw new Error('Invalid mod path')
    }
    const dataDir = this.config.getDataDirectory()
    const modsDir = path.resolve(path.join(instanceDirectory(dataDir, serverId), 'mods'))
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(modsDir + path.sep)) {
      throw new Error('Mod is outside the instance mods folder')
    }
    if (!(await fs.pathExists(resolved))) {
      throw new Error('Mod file not found')
    }
    return resolved
  }
}

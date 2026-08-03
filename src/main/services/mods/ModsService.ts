import fs from 'fs-extra'
import path from 'path'
import type { ConfigService } from '../config/ConfigService'
import type { DistroService } from '../distro/DistroService'
import { commonDirectory, instanceDirectory } from '../../utils/paths'
import type { ModInfo, ModPreview, ServerModsPayload } from '../../../shared/types'
import {
  disabledModPath,
  enabledModPath,
  isDisabledModFile,
  isModArchiveFile,
  listModFilesInDirectory,
  readModMetadataFromJar
} from './modMetadata'
import {
  loadModsListCache,
  loadModsMetaCache,
  removeModsListCache,
  saveModsListCache,
  saveModsMetaCache,
  type CachedModMeta
} from './modsCacheStore'

const MOD_TYPES = new Set(['FabricMod', 'ForgeMod', 'LiteMod', 'LiteLoader'])

interface CachedModsList {
  signature: string
  payload: ServerModsPayload
}

export class ModsService {
  private readonly listCache = new Map<string, CachedModsList>()
  private readonly fileMetaCache = new Map<string, CachedModMeta>()
  private activeDataDir: string | null = null
  private fileMetaLoaded = false
  private metaDirty = false

  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService
  ) {}

  async listMods(serverId: string): Promise<ServerModsPayload> {
    const dataDir = this.config.getDataDirectory()
    this.resetIfDataDirChanged(dataDir)

    const instanceModsDir = path.join(instanceDirectory(dataDir, serverId), 'mods')
    const userPaths = await listModFilesInDirectory(instanceModsDir)
    const commonPaths = await this.listCommonModPaths(serverId, dataDir)
    const signature = await this.buildSignature([...userPaths, ...commonPaths])

    const memoryHit = this.listCache.get(serverId)
    if (memoryHit && memoryHit.signature === signature) {
      return memoryHit.payload
    }

    const diskHit = await loadModsListCache(dataDir, serverId)
    if (diskHit && diskHit.signature === signature) {
      this.listCache.set(serverId, { signature: diskHit.signature, payload: diskHit.payload })
      return diskHit.payload
    }

    await this.ensureFileMetaLoaded(dataDir)

    const userMods = await Promise.all(
      userPaths.map((filePath) => this.toModInfo(filePath, 'user'))
    )
    const commonMods = await Promise.all(
      commonPaths.map((filePath) => this.toModInfo(filePath, 'common'))
    )

    const payload: ServerModsPayload = {
      serverId,
      userMods: userMods.sort((a, b) => a.name.localeCompare(b.name)),
      commonMods: commonMods.sort((a, b) => a.name.localeCompare(b.name))
    }
    this.listCache.set(serverId, { signature, payload })
    await saveModsListCache(dataDir, serverId, signature, payload)
    await this.flushMetaCache(dataDir)
    return payload
  }

  async previewMod(sourcePath: string): Promise<ModPreview> {
    const resolved = await this.assertInstallSource(sourcePath)
    const meta = readModMetadataFromJar(resolved)
    return {
      sourcePath: resolved,
      fileName: path.basename(resolved),
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      authors: meta.authors,
      iconDataUrl: meta.iconDataUrl,
      homepage: meta.homepage
    }
  }

  async installUserMod(serverId: string, sourcePath: string): Promise<ModInfo> {
    const resolved = await this.assertInstallSource(sourcePath)
    const dataDir = this.config.getDataDirectory()
    this.resetIfDataDirChanged(dataDir)
    await this.ensureFileMetaLoaded(dataDir)
    const modsDir = path.resolve(path.join(instanceDirectory(dataDir, serverId), 'mods'))
    await fs.ensureDir(modsDir)

    const fileName = path.basename(resolved)
    const dest = path.join(modsDir, fileName)
    const destDisabled = disabledModPath(dest)
    if (path.resolve(resolved) === path.resolve(dest)) {
      await this.invalidateListCache(serverId, dataDir)
      return this.toModInfo(dest, 'user')
    }
    if ((await fs.pathExists(dest)) || (await fs.pathExists(destDisabled))) {
      throw new Error(`Mod already exists: ${fileName}`)
    }

    await fs.copy(resolved, dest)
    await this.invalidateListCache(serverId, dataDir)
    const info = await this.toModInfo(dest, 'user')
    await this.flushMetaCache(dataDir)
    return info
  }

  async setUserModEnabled(serverId: string, filePath: string, enabled: boolean): Promise<ModInfo> {
    const dataDir = this.config.getDataDirectory()
    this.resetIfDataDirChanged(dataDir)
    await this.ensureFileMetaLoaded(dataDir)
    const safePath = await this.assertUserModPath(serverId, filePath)
    const target = enabled ? enabledModPath(safePath) : disabledModPath(safePath)
    if (path.resolve(safePath) !== path.resolve(target)) {
      if (await fs.pathExists(target)) {
        throw new Error('A mod file with the target name already exists')
      }
      await fs.move(safePath, target)
      this.fileMetaCache.delete(safePath)
      this.metaDirty = true
    }
    await this.invalidateListCache(serverId, dataDir)
    const info = await this.toModInfo(target, 'user')
    await this.flushMetaCache(dataDir)
    return info
  }

  async deleteUserMod(serverId: string, filePath: string): Promise<boolean> {
    const dataDir = this.config.getDataDirectory()
    this.resetIfDataDirChanged(dataDir)
    await this.ensureFileMetaLoaded(dataDir)
    const safePath = await this.assertUserModPath(serverId, filePath)
    await fs.remove(safePath)
    this.fileMetaCache.delete(safePath)
    this.metaDirty = true
    await this.invalidateListCache(serverId, dataDir)
    await this.flushMetaCache(dataDir)
    return true
  }

  private resetIfDataDirChanged(dataDir: string): void {
    if (this.activeDataDir === dataDir) {
      return
    }
    this.activeDataDir = dataDir
    this.listCache.clear()
    this.fileMetaCache.clear()
    this.metaDirty = false
    this.fileMetaLoaded = false
  }

  private async ensureFileMetaLoaded(dataDir: string): Promise<void> {
    this.resetIfDataDirChanged(dataDir)
    if (this.fileMetaLoaded) {
      return
    }
    this.fileMetaLoaded = true

    const disk = await loadModsMetaCache(dataDir)
    if (!disk) return
    for (const [filePath, meta] of Object.entries(disk.entries)) {
      if (!meta || typeof meta.stamp !== 'string' || typeof meta.name !== 'string') continue
      this.fileMetaCache.set(filePath, meta)
    }
  }

  private async invalidateListCache(serverId: string, dataDir: string): Promise<void> {
    this.listCache.delete(serverId)
    await removeModsListCache(dataDir, serverId)
  }

  private async flushMetaCache(dataDir: string): Promise<void> {
    if (!this.metaDirty) return
    this.metaDirty = false
    await saveModsMetaCache(dataDir, this.fileMetaCache)
  }

  private async buildSignature(filePaths: string[]): Promise<string> {
    const parts = await Promise.all(
      filePaths.map(async (filePath) => {
        const st = await fs.stat(filePath)
        return `${filePath}\0${st.mtimeMs}\0${st.size}`
      })
    )
    return parts.sort().join('\n')
  }

  private async listCommonModPaths(serverId: string, dataDir: string): Promise<string[]> {
    const { raw: distro } = await this.distro.get()
    const server =
      distro.getServerById?.(serverId) ||
      distro.servers?.find((s: any) => (s.rawServer?.id || s.id) === serverId)
    if (!server) {
      return []
    }

    const modules = this.collectModModules(server.modules || [])
    const commonRoot = path.resolve(commonDirectory(dataDir))
    const out: string[] = []
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
      out.push(resolved)
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
    const st = await fs.stat(filePath)
    const stamp = `${st.mtimeMs}:${st.size}`
    const cached = this.fileMetaCache.get(filePath)
    const fileName = path.basename(filePath)

    if (cached && cached.stamp === stamp) {
      return {
        id: cached.id,
        fileName,
        filePath,
        source,
        enabled: source === 'common' ? true : !isDisabledModFile(fileName),
        name: cached.name,
        version: cached.version,
        description: cached.description,
        authors: cached.authors,
        iconDataUrl: cached.iconDataUrl,
        homepage: cached.homepage
      }
    }

    const meta = readModMetadataFromJar(filePath)
    this.fileMetaCache.set(filePath, {
      stamp,
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      authors: meta.authors,
      iconDataUrl: meta.iconDataUrl,
      homepage: meta.homepage
    })
    this.metaDirty = true

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
      iconDataUrl: meta.iconDataUrl,
      homepage: meta.homepage
    }
  }

  private async assertInstallSource(sourcePath: string): Promise<string> {
    if (typeof sourcePath !== 'string' || !sourcePath) {
      throw new Error('Invalid mod path')
    }
    const resolved = path.resolve(sourcePath)
    if (!(await fs.pathExists(resolved))) {
      throw new Error('Mod file not found')
    }
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) {
      throw new Error('Mod path is not a file')
    }
    const fileName = path.basename(resolved)
    if (!isModArchiveFile(fileName) || isDisabledModFile(fileName)) {
      throw new Error('Unsupported mod file')
    }
    return resolved
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

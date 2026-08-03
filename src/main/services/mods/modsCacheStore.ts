import fs from 'fs-extra'
import path from 'path'
import type { ServerModsPayload } from '../../../shared/types'

export const MODS_LIST_CACHE_VERSION = 1
export const MODS_META_CACHE_VERSION = 1

export interface CachedModMeta {
  stamp: string
  id: string
  name: string
  version: string
  description: string | null
  authors: string[]
  iconDataUrl: string | null
  homepage: string | null
}

export interface DiskModsListCache {
  version: number
  signature: string
  payload: ServerModsPayload
}

export interface DiskModsMetaCache {
  version: number
  entries: Record<string, CachedModMeta>
}

export function modsListCachePath(dataDirectory: string, serverId: string): string {
  return path.join(dataDirectory, 'cache', 'mods-list', `${serverId}.json`)
}

export function modsMetaCachePath(dataDirectory: string): string {
  return path.join(dataDirectory, 'cache', 'mods-meta.json')
}

function isModInfoLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const mod = value as Record<string, unknown>
  return typeof mod.filePath === 'string' && typeof mod.name === 'string'
}

export async function loadModsListCache(
  dataDirectory: string,
  serverId: string
): Promise<DiskModsListCache | null> {
  const file = modsListCachePath(dataDirectory, serverId)
  if (!(await fs.pathExists(file))) {
    return null
  }
  try {
    const raw = (await fs.readJson(file)) as DiskModsListCache
    if (!raw || raw.version !== MODS_LIST_CACHE_VERSION) return null
    if (typeof raw.signature !== 'string' || !raw.payload) return null
    if (raw.payload.serverId !== serverId) return null
    if (!Array.isArray(raw.payload.userMods) || !Array.isArray(raw.payload.commonMods)) {
      return null
    }
    if (![...raw.payload.userMods, ...raw.payload.commonMods].every(isModInfoLike)) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

export async function saveModsListCache(
  dataDirectory: string,
  serverId: string,
  signature: string,
  payload: ServerModsPayload
): Promise<void> {
  const file = modsListCachePath(dataDirectory, serverId)
  await fs.ensureDir(path.dirname(file))
  const data: DiskModsListCache = {
    version: MODS_LIST_CACHE_VERSION,
    signature,
    payload
  }
  await fs.writeJson(file, data)
}

export async function removeModsListCache(dataDirectory: string, serverId: string): Promise<void> {
  const file = modsListCachePath(dataDirectory, serverId)
  await fs.remove(file).catch(() => undefined)
}

export async function loadModsMetaCache(dataDirectory: string): Promise<DiskModsMetaCache | null> {
  const file = modsMetaCachePath(dataDirectory)
  if (!(await fs.pathExists(file))) {
    return null
  }
  try {
    const raw = (await fs.readJson(file)) as DiskModsMetaCache
    if (!raw || raw.version !== MODS_META_CACHE_VERSION) return null
    if (!raw.entries || typeof raw.entries !== 'object') return null
    return raw
  } catch {
    return null
  }
}

export async function saveModsMetaCache(
  dataDirectory: string,
  entries: Map<string, CachedModMeta>
): Promise<void> {
  const file = modsMetaCachePath(dataDirectory)
  await fs.ensureDir(path.dirname(file))
  const data: DiskModsMetaCache = {
    version: MODS_META_CACHE_VERSION,
    entries: Object.fromEntries(entries.entries())
  }
  await fs.writeJson(file, data)
}

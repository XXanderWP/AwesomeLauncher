import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import {
  isConfigPath,
  normalizeGameRelativePath,
  shouldProtectExistingFromOverwrite
} from '../../../shared/syncRules'

export interface BackupEntry {
  relativePath: string
  absolutePath: string
  tempPath: string
}

/**
 * Backup instance files that must not be permanently overwritten by FullRepair:
 * existing config/** (when preserve enabled), options.txt / optionsshaders.txt, and user mods/.
 * logs/ and saves/ are skipped entirely (never walked).
 * options* and mods/ are always protected even when preserve is disabled.
 */
export async function backupPreservedFiles(
  instanceDir: string,
  enabled: boolean
): Promise<BackupEntry[]> {
  if (!(await fs.pathExists(instanceDir))) {
    return []
  }

  const entries: BackupEntry[] = []
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-preserve-'))

  async function walk(dir: string): Promise<void> {
    const items = await fs.readdir(dir)
    for (const name of items) {
      const abs = path.join(dir, name)
      const stat = await fs.stat(abs)
      const rel = normalizeGameRelativePath(path.relative(instanceDir, abs))
      if (stat.isDirectory()) {
        if (rel === 'saves' || rel === 'logs') {
          continue
        }
        await walk(abs)
        continue
      }
      if (!shouldProtectExistingFromOverwrite(rel)) continue
      // Toggle only gates config/**; options* and mods/ stay protected.
      if (!enabled && isConfigPath(rel)) continue
      const tempPath = path.join(tempRoot, rel)
      await fs.ensureDir(path.dirname(tempPath))
      await fs.copy(abs, tempPath, { overwrite: true })
      entries.push({ relativePath: rel, absolutePath: abs, tempPath })
    }
  }

  await walk(instanceDir)
  return entries
}

export async function restorePreservedFiles(entries: BackupEntry[]): Promise<number> {
  let restored = 0
  for (const entry of entries) {
    try {
      await fs.ensureDir(path.dirname(entry.absolutePath))
      await fs.copy(entry.tempPath, entry.absolutePath, { overwrite: true })
      restored++
    } catch {
      // ignore individual restore failures
    }
  }
  if (entries.length > 0) {
    try {
      const root = entries[0].tempPath.slice(
        0,
        entries[0].tempPath.length - entries[0].relativePath.length
      )
      await fs.remove(root)
    } catch {
      // ignore temp cleanup failures
    }
  }
  return restored
}

/**
 * After FullRepair, drop anything under instance `mods/` that was not present
 * before the repair (pack must not install into the user-mods folder).
 * Only call when a pre-repair backup was taken.
 */
export async function removeUnbackedUserMods(
  instanceDir: string,
  backup: BackupEntry[]
): Promise<number> {
  const modsDir = path.join(instanceDir, 'mods')
  if (!(await fs.pathExists(modsDir))) {
    return 0
  }

  const kept = new Set(
    backup
      .map((e) => normalizeGameRelativePath(e.relativePath))
      .filter((rel) => rel === 'mods' || rel.startsWith('mods/'))
  )

  let removed = 0

  async function walk(dir: string): Promise<void> {
    const items = await fs.readdir(dir)
    for (const name of items) {
      const abs = path.join(dir, name)
      const stat = await fs.stat(abs)
      const rel = normalizeGameRelativePath(path.relative(instanceDir, abs))
      if (stat.isDirectory()) {
        await walk(abs)
        continue
      }
      if (kept.has(rel)) {
        continue
      }
      try {
        await fs.remove(abs)
        removed++
      } catch {
        // ignore locked files
      }
    }
  }

  await walk(modsDir)
  return removed
}

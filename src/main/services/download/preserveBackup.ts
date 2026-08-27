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
 * existing config/** (when preserve enabled) and options.txt / optionsshaders.txt.
 * logs/, saves/, and user mods/ are skipped entirely (never walked).
 * options* are always protected even when preserve is disabled.
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
        if (rel === 'saves' || rel === 'logs' || rel === 'mods') {
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
 * Temporarily clear protected files after their backup. FullRepair otherwise
 * attempts to replace them directly; Windows rejects replacing some hidden
 * config files (for example euphoria_patcher/.data.json).
 */
export async function vacatePreservedFiles(entries: BackupEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      await fs.remove(entry.absolutePath)
    } catch {
      // The subsequent repair will report a precise error if the file is locked.
    }
  }
}

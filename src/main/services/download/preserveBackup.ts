import fs from 'fs-extra'
import path from 'path'
import { isPlayerMutablePath, normalizeGameRelativePath } from '../../../shared/preservePaths'

export interface BackupEntry {
  relativePath: string
  absolutePath: string
  tempPath: string
}

/**
 * Backup player-mutable files before a full repair so they can be restored
 * after Helios FullRepair (which otherwise overwrites MD5-mismatched configs).
 */
export async function backupPreservedFiles(
  instanceDir: string,
  enabled: boolean
): Promise<BackupEntry[]> {
  if (!enabled || !(await fs.pathExists(instanceDir))) {
    return []
  }

  const entries: BackupEntry[] = []
  const tempRoot = await fs.mkdtemp(path.join(require('os').tmpdir(), 'ac-preserve-'))

  async function walk(dir: string): Promise<void> {
    const items = await fs.readdir(dir)
    for (const name of items) {
      const abs = path.join(dir, name)
      const stat = await fs.stat(abs)
      const rel = normalizeGameRelativePath(path.relative(instanceDir, abs))
      if (stat.isDirectory()) {
        if (rel === 'saves' || rel === 'logs' || rel === 'crash-reports' || rel === 'screenshots') {
          continue
        }
        await walk(abs)
        continue
      }
      if (!isPlayerMutablePath(rel)) continue
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
    const tempRoot = path.dirname(
      entries[0].tempPath.split(path.sep + entries[0].relativePath)[0] || entries[0].tempPath
    )
    // Clean temp by resolving common root
    try {
      const root = entries[0].tempPath.slice(
        0,
        entries[0].tempPath.length - entries[0].relativePath.length
      )
      await fs.remove(root)
    } catch {
      void tempRoot
    }
  }
  return restored
}

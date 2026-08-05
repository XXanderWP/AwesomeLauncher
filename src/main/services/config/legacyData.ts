import fs from 'fs-extra'
import path from 'path'
import type { LegacyDataOffer } from '../../../shared/types'
import { legacyDefaultDataDirectory } from '../../utils/paths'

/**
 * True when the folder already has launcher game files (common/instances/sync-index).
 * An empty directory created by `ensureDir` does not count.
 */
export async function dataDirectoryHasGameFiles(dataDirectory: string): Promise<boolean> {
  if (!(await fs.pathExists(dataDirectory))) return false

  const markers = [
    path.join(dataDirectory, 'common', 'libraries'),
    path.join(dataDirectory, 'common', 'versions'),
    path.join(dataDirectory, 'common', 'mods'),
    path.join(dataDirectory, 'instances'),
    path.join(dataDirectory, 'sync-index')
  ]

  for (const marker of markers) {
    if (!(await fs.pathExists(marker))) continue
    const stat = await fs.stat(marker)
    if (stat.isFile()) return true
    const entries = await fs.readdir(marker)
    if (entries.length > 0) return true
  }
  return false
}

/**
 * Offer to reuse the old Helios / AwesomeCraftLauncher folder when the current
 * data directory has no downloads yet and the legacy folder does.
 */
export async function evaluateLegacyDataOffer(options: {
  currentDataDirectory: string
  legacyDataPromptSeen: boolean
  /** Override for tests; defaults to Helios `.helioslauncher` path. */
  legacyPath?: string
}): Promise<LegacyDataOffer> {
  const legacyPath = options.legacyPath ?? legacyDefaultDataDirectory()

  if (options.legacyDataPromptSeen) {
    return { shouldOffer: false, legacyPath }
  }

  const currentResolved = path.resolve(options.currentDataDirectory)
  const legacyResolved = path.resolve(legacyPath)
  if (currentResolved === legacyResolved) {
    return { shouldOffer: false, legacyPath }
  }

  if (await dataDirectoryHasGameFiles(options.currentDataDirectory)) {
    return { shouldOffer: false, legacyPath }
  }

  if (!(await dataDirectoryHasGameFiles(legacyPath))) {
    return { shouldOffer: false, legacyPath }
  }

  return { shouldOffer: true, legacyPath }
}

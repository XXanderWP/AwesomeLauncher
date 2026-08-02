/**
 * @deprecated Import from `./syncRules` instead.
 * Re-exports kept so older call sites and tests keep working.
 */
export {
  normalizeGameRelativePath,
  isPlayerMutablePath,
  shouldPreserveExistingFile,
  shouldProtectExistingFromOverwrite,
  isFullyImmunePath,
  isUserModsPath,
  isConfigPath,
  isPackManagedConfigPath,
  isNeverOverwriteFile,
  canDeleteOrphanTrackedPath,
  FULLY_IMMUNE_DIRS,
  USER_MODS_DIR
} from './syncRules'

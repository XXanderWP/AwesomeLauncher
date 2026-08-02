const path = require('path')
const fs = require('fs-extra')
const AdmZip = require('adm-zip')

/**
 * Destination path for a native library zip entry.
 * Must use basename only: zip entries like `linux/libglfw.so` or `/libglfw.so`
 * would make path.join() reset to an absolute path on POSIX and write outside
 * the natives dir (or fail silently), causing LWJGL SIGSEGV on launch.
 */
function resolveNativeExtractPath(tempNativePath, entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/')
  const base = path.basename(normalized)
  if (!base || base === '.' || base === '..') {
    return null
  }
  return path.join(tempNativePath, base)
}

function extractNativeZip(zipFilePath, tempNativePath, exclusionArr) {
  const zip = new AdmZip(zipFilePath)
  const zipEntries = zip.getEntries()
  for (let i = 0; i < zipEntries.length; i++) {
    const entry = zipEntries[i]
    if (entry.isDirectory) {
      continue
    }
    const fileName = entry.entryName
    let shouldExclude = false
    for (let e = 0; e < exclusionArr.length; e++) {
      if (fileName.indexOf(exclusionArr[e]) > -1) {
        shouldExclude = true
        break
      }
    }
    if (shouldExclude) {
      continue
    }
    const dest = resolveNativeExtractPath(tempNativePath, fileName)
    if (!dest) {
      continue
    }
    // Synchronous write: the game must not start before natives are on disk.
    fs.writeFileSync(dest, entry.getData())
  }
}

module.exports = {
  resolveNativeExtractPath,
  extractNativeZip
}

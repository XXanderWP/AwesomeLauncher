const crypto = require('node:crypto')
const fs = require('fs-extra')
const path = require('node:path')

const NEOFORGE_MOD_TYPE = 'NeoForgeMod'

function isMinecraftAtLeast(version, minimum) {
  const parse = (value) => value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const actual = parse(version)
  const expected = parse(minimum)
  for (let index = 0; index < Math.max(actual.length, expected.length); index++) {
    const difference = (actual[index] || 0) - (expected[index] || 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

function locatorGeneration(minecraftVersion) {
  return isMinecraftAtLeast(minecraftVersion, '1.20.5') ? 'modern-1.20.5' : 'legacy-1.20.1'
}

function safeManifestDirectory(serverId) {
  const readable = String(serverId)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const hash = crypto.createHash('sha256').update(String(serverId)).digest('hex').slice(0, 12)
  return `${readable || 'server'}-${hash}`
}

function assertCentralModPath(root, candidate) {
  const resolved = path.resolve(candidate)
  const relative = path.relative(root, resolved)
  if (
    !relative ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative) ||
    path.extname(resolved).toLowerCase() !== '.jar'
  ) {
    throw new Error(`NeoForge pack mod is outside the central store: ${resolved}`)
  }
  if (!fs.pathExistsSync(resolved)) {
    throw new Error(`NeoForge pack mod is missing after repair: ${resolved}`)
  }
  return resolved
}

function writeNeoForgeModManifest(commonDir, serverId, mods) {
  const root = path.resolve(commonDir, 'mods', 'neoforge')
  fs.ensureDirSync(root)
  const manifestDir = path.join(commonDir, 'mod-manifests', safeManifestDirectory(serverId))
  const manifestPath = path.join(manifestDir, 'neoforge.list')
  fs.ensureDirSync(manifestDir)

  const entries = mods
    .filter((mod) => mod?.rawModule?.type === NEOFORGE_MOD_TYPE)
    .map((mod) => assertCentralModPath(root, mod.getPath()))
  fs.writeFileSync(
    manifestPath,
    ['# awesomecraft-neoforge-mod-manifest-v1', ...entries, ''].join('\n'),
    'utf8'
  )
  return { manifestPath, modRoot: root, entries }
}

function injectLocatorJvmArguments(args, locatorJar, manifestPath, modRoot) {
  if (!fs.pathExistsSync(locatorJar)) {
    throw new Error(`Bundled NeoForge locator is missing: ${locatorJar}`)
  }

  const modulePathIndex = args.findIndex((arg) => arg === '-p' || arg === '--module-path')
  if (modulePathIndex < 0 || typeof args[modulePathIndex + 1] !== 'string') {
    throw new Error('NeoForge launch profile has no module path for the AwesomeCraft locator')
  }
  args[modulePathIndex + 1] = `${args[modulePathIndex + 1]}${path.delimiter}${locatorJar}`
  args.push(`-Dawesomecraft.neoforge.modManifest=${manifestPath}`)
  args.push(`-Dawesomecraft.neoforge.modRoot=${modRoot}`)
  return args
}

module.exports = {
  NEOFORGE_MOD_TYPE,
  injectLocatorJvmArguments,
  locatorGeneration,
  safeManifestDirectory,
  writeNeoForgeModManifest
}

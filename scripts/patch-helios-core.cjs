const fs = require('node:fs')
const path = require('node:path')

/**
 * helios-core 2.3 has no NeoForgeMod wire type and still stores Forge mods in
 * common/modstore. Keep this small compatibility patch until those two path
 * rules are available in an upstream release.
 */
function patchHeliosCore(root = path.join(__dirname, '..')) {
  const packagePath = path.join(root, 'node_modules', 'helios-core', 'package.json')
  const factoryPath = path.join(
    root,
    'node_modules',
    'helios-core',
    'dist',
    'common',
    'distribution',
    'DistributionFactory.js'
  )

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  if (!/^2\.3\./.test(pkg.version)) {
    throw new Error(`Unsupported helios-core version ${pkg.version}; review the mod-store patch`)
  }

  const marker = "case 'NeoForgeMod':"
  let source = fs.readFileSync(factoryPath, 'utf8')
  if (source.includes(marker)) {
    return { factoryPath, changed: false }
  }

  const original = `            case helios_distribution_types_1.Type.ForgeMod:\n            case helios_distribution_types_1.Type.LiteMod:\n                // TODO Move to /mods/forge eventually..\n                return (0, path_1.join)(commonDir, 'modstore', relativePath);`
  const replacement = `            case helios_distribution_types_1.Type.ForgeMod:\n                return (0, path_1.join)(commonDir, 'mods', 'forge', relativePath);\n            case 'NeoForgeMod':\n                return (0, path_1.join)(commonDir, 'mods', 'neoforge', relativePath);\n            case helios_distribution_types_1.Type.LiteMod:\n                return (0, path_1.join)(commonDir, 'modstore', relativePath);`

  if (!source.includes(original)) {
    throw new Error('helios-core DistributionFactory layout changed; refusing an unsafe patch')
  }
  source = source.replace(original, replacement)
  fs.writeFileSync(factoryPath, source, 'utf8')
  return { factoryPath, changed: true }
}

if (require.main === module) {
  const result = patchHeliosCore()
  console.log(`${result.changed ? 'Patched' : 'Verified'} ${result.factoryPath}`)
}

module.exports = { patchHeliosCore }

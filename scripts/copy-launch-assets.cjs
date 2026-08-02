const fs = require('node:fs')
const path = require('node:path')

const FILES = [
  'processbuilder.legacy.js',
  'launchBridge.js',
  'nativeExtract.js',
  'launchEnv.js'
]

function copyLaunchAssets(root = path.join(__dirname, '..')) {
  const srcDir = path.join(root, 'src', 'main', 'services', 'launch')
  const destDir = path.join(root, 'out', 'launch')
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of FILES) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file))
  }
  return { srcDir, destDir, files: FILES }
}

function main() {
  const { destDir, files } = copyLaunchAssets()
  console.log(`Copied launch helpers to ${destDir}/ (${files.join(', ')})`)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

module.exports = { copyLaunchAssets, FILES }

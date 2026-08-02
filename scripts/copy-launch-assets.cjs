const fs = require('fs-extra')
const path = require('path')

async function main() {
  const root = path.join(__dirname, '..')
  const srcDir = path.join(root, 'src', 'main', 'services', 'launch')
  const destDir = path.join(root, 'out', 'launch')
  await fs.ensureDir(destDir)
  await fs.copy(
    path.join(srcDir, 'processbuilder.legacy.js'),
    path.join(destDir, 'processbuilder.legacy.js')
  )
  await fs.copy(path.join(srcDir, 'launchBridge.js'), path.join(destDir, 'launchBridge.js'))
  await fs.copy(path.join(srcDir, 'nativeExtract.js'), path.join(destDir, 'nativeExtract.js'))
  await fs.copy(path.join(srcDir, 'launchEnv.js'), path.join(destDir, 'launchEnv.js'))
  console.log('Copied launch helpers to out/launch/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

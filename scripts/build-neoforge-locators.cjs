const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing ${name} <jar>`)
  }
  return path.resolve(process.argv[index + 1])
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`)
  }
}

function buildLocator({ root, name, release, classpath }) {
  const project = path.join(root, 'neoforge-locator', name)
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), `awesomecraft-${name}-`))
  const classes = path.join(buildRoot, 'classes')
  const outputDir = path.join(root, 'resources', 'libraries', 'neoforge-locator')
  const output = path.join(outputDir, `${name}.jar`)
  fs.mkdirSync(classes, { recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })

  const sources = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      else if (entry.name.endsWith('.java')) sources.push(fullPath)
    }
  }
  visit(path.join(project, 'src'))

  run('javac', [
    '--release',
    String(release),
    '-cp',
    classpath.join(path.delimiter),
    '-d',
    classes,
    ...sources
  ])
  fs.cpSync(path.join(project, 'resources'), classes, { recursive: true })
  run('jar', [
    '--create',
    '--file',
    output,
    '--manifest',
    path.join(root, 'neoforge-locator', 'MANIFEST.MF'),
    '-C',
    classes,
    '.'
  ])
  fs.rmSync(buildRoot, { recursive: true, force: true })
  console.log(`Built ${output}`)
}

function main() {
  const root = path.join(__dirname, '..')
  buildLocator({
    root,
    name: 'legacy-1.20.1',
    release: 17,
    classpath: [argument('--legacy-fml'), argument('--legacy-spi')]
  })
  buildLocator({
    root,
    name: 'modern-1.20.5',
    release: 21,
    classpath: [argument('--modern-loader')]
  })
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exit(1)
}

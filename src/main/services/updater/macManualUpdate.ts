import { execFile } from 'child_process'
import fs from 'fs-extra'
import got from 'got'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { macReleaseArtifactName } from '../../../shared/releaseArtifacts'

const execFileAsync = promisify(execFile)

export const GITHUB_OWNER = 'XXanderWP'
export const GITHUB_REPO = 'AwesomeLauncher'
export const MAC_APP_NAME = 'AwesomeCraftLauncher.app'

export interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
  size?: number
}

export interface GitHubRelease {
  tag_name: string
  name: string | null
  prerelease: boolean
  draft: boolean
  published_at: string | null
  assets: GitHubReleaseAsset[]
}

export interface MacUpdateCandidate {
  version: string
  releaseName?: string
  releaseDate?: string
  dmgUrl: string
  dmgName: string
}

/** Compare dotted semver-ish versions. Returns >0 if a>b. */
export function compareVersions(a: string, b: string): number {
  const normalize = (value: string): number[] =>
    value
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => {
        const n = Number.parseInt(part, 10)
        return Number.isFinite(n) ? n : 0
      })

  const left = normalize(a)
  const right = normalize(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function macArchLabel(arch: string = process.arch): 'arm64' | 'x64' {
  return arch === 'arm64' ? 'arm64' : 'x64'
}

export function resolveMacAppBundlePath(execPath: string = process.execPath): string {
  const parts = execPath.split(path.sep)
  const appIndex = parts.findIndex((part) => part.endsWith('.app'))
  if (appIndex >= 0) {
    return parts.slice(0, appIndex + 1).join(path.sep)
  }
  return path.join('/Applications', MAC_APP_NAME)
}

export function pickMacDmgAsset(
  assets: GitHubReleaseAsset[],
  _version: string,
  arch: 'arm64' | 'x64'
): GitHubReleaseAsset | null {
  const expected = macReleaseArtifactName(arch, 'dmg')
  const exact = assets.find((asset) => asset.name === expected)
  if (exact) return exact
  return (
    assets.find(
      (asset) =>
        asset.name.toLowerCase().endsWith('.dmg') &&
        (asset.name === expected || asset.name.includes(`-${arch}.`))
    ) ||
    assets.find(
      (asset) => asset.name.toLowerCase().endsWith('.dmg') && asset.name.includes(`-${arch}`)
    ) ||
    null
  )
}

export async function fetchMacUpdateCandidate(options: {
  currentVersion: string
  allowPrerelease: boolean
  arch?: 'arm64' | 'x64'
}): Promise<MacUpdateCandidate | null> {
  const arch = options.arch || macArchLabel()
  const releases = await got
    .get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
      searchParams: { per_page: 15 },
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AwesomeCraftLauncher'
      },
      responseType: 'json',
      timeout: { request: 30000 }
    })
    .json<GitHubRelease[]>()

  const candidates = (releases || []).filter((release) => {
    if (release.draft) return false
    if (release.prerelease && !options.allowPrerelease) return false
    return true
  })

  for (const release of candidates) {
    const version = release.tag_name.replace(/^v/i, '')
    if (compareVersions(version, options.currentVersion) <= 0) {
      continue
    }
    const asset = pickMacDmgAsset(release.assets || [], version, arch)
    if (!asset) continue
    return {
      version,
      releaseName: release.name || undefined,
      releaseDate: release.published_at || undefined,
      dmgUrl: asset.browser_download_url,
      dmgName: asset.name
    }
  }

  return null
}

export function buildMacPrivilegedUpdateScript(options: {
  dmgUrl: string
  appPath: string
  productAppName?: string
}): string {
  const productAppName = options.productAppName || MAC_APP_NAME
  const url = options.dmgUrl.replace(/'/g, `'\\''`)
  const appPath = options.appPath.replace(/'/g, `'\\''`)
  const product = productAppName.replace(/'/g, `'\\''`)

  // Bash content is emitted as a string; `${...}` must be escaped for TS templates.
  return `#!/bin/bash
set -euo pipefail
URL='${url}'
APP_DEST='${appPath}'
PRODUCT_APP='${product}'
WORKDIR="$(mktemp -d /tmp/ac-mac-upd.XXXXXX)"
MOUNT="$WORKDIR/mnt"
DMG="$WORKDIR/update.dmg"
NEW_APP="$WORKDIR/$PRODUCT_APP"
cleanup() {
  hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force 2>/dev/null || true
  rm -rf "$WORKDIR" || true
}
trap cleanup EXIT
mkdir -p "$MOUNT"
curl -fL "$URL" -o "$DMG"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT"
APP_SRC="$MOUNT/$PRODUCT_APP"
if [ ! -d "$APP_SRC" ]; then
  APP_SRC="$(find "$MOUNT" -maxdepth 2 -name '*.app' -type d | head -n 1 || true)"
fi
if [ -z "\${APP_SRC}" ] || [ ! -d "\${APP_SRC}" ]; then
  echo "Update DMG does not contain an .app bundle" >&2
  exit 1
fi
rm -rf "$NEW_APP"
ditto "$APP_SRC" "$NEW_APP"
xattr -dr com.apple.quarantine "$NEW_APP" || true
if [ -d "$APP_DEST" ]; then
  rm -rf "\${APP_DEST}.old"
  mv "$APP_DEST" "\${APP_DEST}.old"
fi
mkdir -p "$(dirname "$APP_DEST")"
mv "$NEW_APP" "$APP_DEST"
xattr -dr com.apple.quarantine "$APP_DEST" || true
rm -rf "\${APP_DEST}.old" || true
hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force 2>/dev/null || true
trap - EXIT
rm -rf "$WORKDIR" || true
(sleep 2; open "$APP_DEST") &
exit 0
`
}

export async function runMacPrivilegedUpdate(options: {
  dmgUrl: string
  appPath: string
}): Promise<void> {
  const script = buildMacPrivilegedUpdateScript(options)
  const scriptPath = path.join(os.tmpdir(), `ac-mac-update-${Date.now()}.sh`)
  await fs.writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o700 })

  try {
    const quoted = scriptPath.replace(/'/g, `'\\''`)
    await execFileAsync(
      'osascript',
      ['-e', `do shell script "bash '${quoted}'" with administrator privileges`],
      {
        timeout: 20 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024
      }
    )
  } finally {
    await fs.remove(scriptPath).catch(() => undefined)
  }
}

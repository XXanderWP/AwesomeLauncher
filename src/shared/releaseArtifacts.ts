/** Basename for GitHub Release download artifacts (no version, no "setup"). */
export const RELEASE_FILE_BASENAME = 'AwesomeLauncher'

export function windowsReleaseArtifactName(): string {
  return `${RELEASE_FILE_BASENAME}.exe`
}

export function linuxReleaseArtifactName(): string {
  return `${RELEASE_FILE_BASENAME}.AppImage`
}

export function macReleaseArtifactName(arch: 'arm64' | 'x64', ext: 'dmg' | 'zip' = 'dmg'): string {
  return `${RELEASE_FILE_BASENAME}-${arch}.${ext}`
}

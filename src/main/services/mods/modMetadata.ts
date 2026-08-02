import path from 'path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'

const DISABLED_SUFFIX = '.disabled'
const MAX_ICON_BYTES = 512 * 1024

export function isDisabledModFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.jar.disabled') || lower.endsWith('.zip.disabled')
}

export function isModArchiveFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith('.jar') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.jar.disabled') ||
    lower.endsWith('.zip.disabled')
  )
}

export function enabledModPath(filePath: string): string {
  if (filePath.toLowerCase().endsWith(DISABLED_SUFFIX)) {
    return filePath.slice(0, -DISABLED_SUFFIX.length)
  }
  return filePath
}

export function disabledModPath(filePath: string): string {
  if (filePath.toLowerCase().endsWith(DISABLED_SUFFIX)) {
    return filePath
  }
  return `${filePath}${DISABLED_SUFFIX}`
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function asStringList(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object' && 'name' in item) {
          return asString((item as { name?: unknown }).name) || ''
        }
        return ''
      })
      .filter(Boolean)
  }
  return []
}

function mimeFromIconPath(iconPath: string): string {
  const lower = iconPath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

function readZipEntry(zip: AdmZip, entryName: string): Buffer | null {
  const entry = zip.getEntry(entryName.replace(/^\/+/, ''))
  if (!entry || entry.isDirectory) return null
  try {
    return entry.getData()
  } catch {
    return null
  }
}

function asHttpUrl(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) return null
  return raw
}

function pickHomepage(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const url = asHttpUrl(candidate)
    if (url) return url
  }
  return null
}

function parseFabricModJson(raw: string): {
  id: string | null
  name: string | null
  version: string | null
  description: string | null
  authors: string[]
  icon: string | null
  homepage: string | null
} | null {
  try {
    const json = JSON.parse(raw) as Record<string, unknown>
    const iconValue = json.icon
    let icon: string | null = null
    if (typeof iconValue === 'string') icon = iconValue
    else if (iconValue && typeof iconValue === 'object') {
      const values = Object.values(iconValue as Record<string, unknown>)
      icon = asString(values[0])
    }
    const contact =
      json.contact && typeof json.contact === 'object'
        ? (json.contact as Record<string, unknown>)
        : null
    return {
      id: asString(json.id),
      name: asString(json.name),
      version: asString(json.version),
      description: asString(json.description),
      authors: asStringList(json.authors),
      icon,
      homepage: pickHomepage(contact?.homepage, contact?.sources, contact?.issues)
    }
  } catch {
    return null
  }
}

/** Minimal TOML-ish extract for mods.toml name/version/authors/description. */
export function parseModsToml(raw: string): {
  id: string | null
  name: string | null
  version: string | null
  description: string | null
  authors: string[]
  logoFile: string | null
  homepage: string | null
} {
  const modsBlock = raw.match(/\[\[mods\]\]([\s\S]*?)(?=\n\[\[|$)/)
  const block = modsBlock ? modsBlock[1] : raw
  const pick = (key: string, source: string = block): string | null => {
    const m = source.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'))
    return m?.[1]?.trim() || null
  }
  const authorsRaw = pick('authors')
  return {
    id: pick('modId'),
    name: pick('displayName') || pick('modId'),
    version: pick('version'),
    description: pick('description'),
    authors: authorsRaw
      ? authorsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    logoFile: pick('logoFile'),
    homepage: pickHomepage(pick('displayURL'), pick('displayURL', raw))
  }
}

function fallbackNameFromFile(fileName: string): string {
  return fileName.replace(/\.jar(\.disabled)?$/i, '').replace(/\.zip(\.disabled)?$/i, '')
}

export function readModMetadataFromJar(filePath: string): {
  id: string
  name: string
  version: string
  description: string | null
  authors: string[]
  iconDataUrl: string | null
  homepage: string | null
} {
  const fileName = path.basename(filePath)
  const fallback = {
    id: fallbackNameFromFile(fileName),
    name: fallbackNameFromFile(fileName),
    version: '',
    description: null as string | null,
    authors: [] as string[],
    iconDataUrl: null as string | null,
    homepage: null as string | null
  }

  try {
    const zip = new AdmZip(filePath)
    const fabricBuf = readZipEntry(zip, 'fabric.mod.json')
    if (fabricBuf) {
      const parsed = parseFabricModJson(fabricBuf.toString('utf8'))
      if (parsed) {
        let iconDataUrl: string | null = null
        if (parsed.icon) {
          const iconBuf = readZipEntry(zip, parsed.icon)
          if (iconBuf && iconBuf.length > 0 && iconBuf.length <= MAX_ICON_BYTES) {
            iconDataUrl = `data:${mimeFromIconPath(parsed.icon)};base64,${iconBuf.toString('base64')}`
          }
        }
        return {
          id: parsed.id || fallback.id,
          name: parsed.name || fallback.name,
          version: parsed.version || '',
          description: parsed.description,
          authors: parsed.authors,
          iconDataUrl,
          homepage: parsed.homepage
        }
      }
    }

    const tomlBuf =
      readZipEntry(zip, 'META-INF/mods.toml') || readZipEntry(zip, 'META-INF/neoforge.mods.toml')
    if (tomlBuf) {
      const parsed = parseModsToml(tomlBuf.toString('utf8'))
      let iconDataUrl: string | null = null
      if (parsed.logoFile) {
        const iconBuf =
          readZipEntry(zip, parsed.logoFile) || readZipEntry(zip, `META-INF/${parsed.logoFile}`)
        if (iconBuf && iconBuf.length > 0 && iconBuf.length <= MAX_ICON_BYTES) {
          iconDataUrl = `data:${mimeFromIconPath(parsed.logoFile)};base64,${iconBuf.toString('base64')}`
        }
      }
      return {
        id: parsed.id || fallback.id,
        name: parsed.name || fallback.name,
        version: parsed.version || '',
        description: parsed.description,
        authors: parsed.authors,
        iconDataUrl,
        homepage: parsed.homepage
      }
    }
  } catch {
    // corrupt zip — fall through
  }

  return fallback
}

export async function listModFilesInDirectory(dir: string): Promise<string[]> {
  if (!(await fs.pathExists(dir))) {
    return []
  }
  const names = await fs.readdir(dir)
  return names
    .filter((name) => isModArchiveFile(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
}

/**
 * Fetch Ely.by skin textures in the main process.
 *
 * Renderer canvas needs a same-origin (data:) image because:
 * - skinsystem redirects to http://ely.by/storage/... (CSP img-src is https-only)
 * - storage responses omit CORS headers (crossOrigin + toDataURL fails)
 *
 * Docs: https://docs.ely.by/en/skins-system.html
 *   GET https://skinsystem.ely.by/textures/{nickname}
 *   GET https://skinsystem.ely.by/skins/{nickname}.png
 */

import { elybySkinUrl, elybyTexturesUrl, upgradeElybyAssetUrl } from '../../../shared/elybyProfile'

const USER_AGENT = 'AwesomeLauncher'

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
}

async function bufferToPngDataUrl(buf: Buffer): Promise<string | null> {
  if (!isPng(buf)) return null
  return `data:image/png;base64,${buf.toString('base64')}`
}

async function fetchPngDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,*/*' },
    redirect: 'follow'
  })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return bufferToPngDataUrl(buf)
}

export async function fetchElybySkinDataUrl(username: string): Promise<string | null> {
  const name = username.trim()
  if (!name) return null

  try {
    const texRes = await fetch(elybyTexturesUrl(name), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    })
    if (texRes.ok) {
      const body = (await texRes.json()) as { SKIN?: { url?: string } }
      const skinUrl = body?.SKIN?.url
      if (typeof skinUrl === 'string' && skinUrl.length > 0) {
        const dataUrl = await fetchPngDataUrl(upgradeElybyAssetUrl(skinUrl))
        if (dataUrl) return dataUrl
      }
    }
  } catch {
    // Fall through to /skins/{name}.png
  }

  try {
    return await fetchPngDataUrl(`${elybySkinUrl(name, 0).split('?')[0]}`)
  } catch {
    return null
  }
}

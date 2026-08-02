/**
 * Random loading media picker (mirrors AwesomeCraftLauncher GifManager).
 *
 * Drop any GIF / MP4 / WebM / AVIF / WebP into:
 *   src/renderer/assets/media/loading/
 * and it will be included in the random pool via Vite glob.
 */

const mediaModules = import.meta.glob('../assets/media/loading/*.{gif,webp,avif,mp4,webm}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const VIDEO_EXTS = /\.(mp4|webm)$/i

const mediaUrls: string[] = Object.values(mediaModules).filter(Boolean)

export type LoadingMediaType = 'image' | 'video'

export interface LoadingMedia {
  url: string
  type: LoadingMediaType
}

export function getMediaType(url: string): LoadingMediaType {
  return VIDEO_EXTS.test(url) ? 'video' : 'image'
}

/** Extra hold after init so the splash GIF can play (Craft: LOADING_EXTRA_DELAY_MS). */
export const LOADING_EXTRA_DELAY_MS = 2000

/** Crossfade duration when leaving splash for the main UI (Craft: FADE_MS). */
export const LOADING_FADE_MS = 500

export function getRandomLoadingMedia(): LoadingMedia | null {
  if (mediaUrls.length === 0) return null
  const url = mediaUrls[Math.floor(Math.random() * mediaUrls.length)]
  return { url, type: getMediaType(url) }
}

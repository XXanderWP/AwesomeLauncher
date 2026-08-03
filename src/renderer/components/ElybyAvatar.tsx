import { useEffect, useState } from 'react'
import { getElybySkinDataUrl } from '../skin/elybySkinCache'

interface Props {
  username: string
  size?: number
  className?: string
}

function renderHeadDataUrl(skin: HTMLImageElement, size: number): string {
  const scale = skin.width / 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  // Face + helmet overlay (Minecraft skin UV layout).
  ctx.drawImage(skin, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size)
  ctx.drawImage(skin, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size)
  return canvas.toDataURL()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode skin image'))
    img.src = src
  })
}

export function ElybyAvatar({ username, size = 72, className }: Props): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const name = username.trim()
    if (!name) {
      setSrc(null)
      return
    }

    setSrc(null)
    void (async () => {
      try {
        const dataUrl = await getElybySkinDataUrl(name)
        if (cancelled || !dataUrl) {
          if (!cancelled) setSrc(null)
          return
        }
        const skin = await loadImage(dataUrl)
        if (cancelled) return
        setSrc(renderHeadDataUrl(skin, size) || null)
      } catch {
        if (!cancelled) setSrc(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [username, size])

  if (!src) {
    return (
      <div
        className={`ely-avatar ely-avatar-fallback${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {(username || '?').slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      className={`ely-avatar${className ? ` ${className}` : ''}`}
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  )
}

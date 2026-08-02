import { useEffect, useState } from 'react'
import { elybySkinUrl } from '@shared/elybyProfile'

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
  ctx.drawImage(skin, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size)
  ctx.drawImage(skin, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, size, size)
  return canvas.toDataURL()
}

export function ElybyAvatar({ username, size = 72, className }: Props): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        setSrc(renderHeadDataUrl(img, size))
      } catch {
        setSrc(null)
      }
    }
    img.onerror = () => {
      if (!cancelled) setSrc(null)
    }
    img.src = elybySkinUrl(username)
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

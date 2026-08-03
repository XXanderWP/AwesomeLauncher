import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

interface MapWaypoint {
  name: string
  initials: string
  x: number
  y: number
  z: number
  color: string
  kind: 'normal' | 'death'
}

interface LogoutPosition {
  x: number
  y: number
  z: number
  source: string
  label: string
}

interface MapPayload {
  dataUrl: string
  width: number
  height: number
  originBlockX: number
  originBlockZ: number
  blocksPerPixel: number
  waypoints: MapWaypoint[]
  logoutPosition: LogoutPosition | null
  regionCount: number
}

interface Props {
  open: boolean
  serverId: string
  host: string
  serverName: string
  onClose: () => void
}

/** When each world block is drawn at least this many CSS pixels, highlight a single block. */
const BLOCK_MODE_MIN_PX = 8

export function InstanceMapModal({
  open,
  serverId,
  host,
  serverName,
  onClose
}: Props): React.JSX.Element | null {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [map, setMap] = useState<MapPayload | null>(null)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const viewRef = useRef({
    scale: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    hoverPixelX: -1,
    hoverPixelY: -1
  })
  const [hud, setHud] = useState({
    coordText: '',
    caption: '',
    mode: 'chunk' as 'chunk' | 'block'
  })
  const hoverBlockRef = useRef<{
    x: number
    z: number
    displayName: string
    blockId: string
  } | null>(null)
  const blockLookupSeq = useRef(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setMap(null)
    void (async () => {
      try {
        const result = await window.awesomeAPI.renderXaeroMap(serverId, host)
        if (cancelled) return
        if (!result.available || !result.dataUrl) {
          setError(result.error || t('instance.map.unavailable'))
          return
        }
        setMap({
          dataUrl: result.dataUrl,
          width: result.width,
          height: result.height,
          originBlockX: result.originBlockX,
          originBlockZ: result.originBlockZ,
          blocksPerPixel: result.blocksPerPixel,
          waypoints: result.waypoints || [],
          logoutPosition: result.logoutPosition,
          regionCount: result.regionCount
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, serverId, host])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    const viewport = viewportRef.current
    const data = map
    if (!canvas || !img || !viewport || !data || !img.complete) return

    const dpr = window.devicePixelRatio || 1
    const cssW = viewport.clientWidth
    const cssH = viewport.clientHeight
    if (cssW <= 0 || cssH <= 0) return

    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const v = viewRef.current
    ctx.fillStyle = '#121216'
    ctx.fillRect(0, 0, cssW, cssH)

    ctx.save()
    ctx.translate(v.panX, v.panY)
    ctx.scale(v.scale, v.scale)
    ctx.drawImage(img, 0, 0, data.width, data.height)

    // Waypoints — colored outline like in-game Xaero, full name, larger type
    for (const wp of data.waypoints) {
      const px = (wp.x - data.originBlockX) / data.blocksPerPixel
      const pz = (wp.z - data.originBlockZ) / data.blocksPerPixel
      if (px < -4 || pz < -4 || px > data.width + 4 || pz > data.height + 4) continue
      const cx = px + 0.5
      const cy = pz + 0.5
      const r = Math.max(6 / v.scale, 4 / v.scale)
      ctx.beginPath()
      ctx.fillStyle = wp.color
      ctx.strokeStyle = '#0a0a0c'
      ctx.lineWidth = 2 / v.scale
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Inner ring in waypoint colour for stronger in-game-like outline
      ctx.beginPath()
      ctx.strokeStyle = wp.color
      ctx.lineWidth = 1.5 / v.scale
      ctx.arc(cx, cy, r + 2 / v.scale, 0, Math.PI * 2)
      ctx.stroke()

      const fontPx = Math.max(20 / v.scale, 16 / v.scale)
      ctx.font = `700 ${fontPx}px sans-serif`
      ctx.textBaseline = 'middle'
      const label = wp.name || wp.initials || '?'
      const labelX = cx + r + 4 / v.scale
      const labelY = cy
      // Dark halo for readability, then coloured outline, then light fill
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.lineWidth = 5 / v.scale
      ctx.strokeText(label, labelX, labelY)
      ctx.strokeStyle = wp.color
      ctx.lineWidth = 3 / v.scale
      ctx.strokeText(label, labelX, labelY)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, labelX, labelY)
    }

    // Logout / death marker
    if (data.logoutPosition) {
      const px = (data.logoutPosition.x - data.originBlockX) / data.blocksPerPixel
      const pz = (data.logoutPosition.z - data.originBlockZ) / data.blocksPerPixel
      const size = Math.max(8 / v.scale, 5 / v.scale)
      ctx.strokeStyle = '#ff4d4d'
      ctx.fillStyle = 'rgba(255, 77, 77, 0.25)'
      ctx.lineWidth = 2 / v.scale
      ctx.beginPath()
      ctx.moveTo(px + 0.5, pz + 0.5 - size)
      ctx.lineTo(px + 0.5 + size * 0.7, pz + 0.5 + size * 0.6)
      ctx.lineTo(px + 0.5 - size * 0.7, pz + 0.5 + size * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // Hover highlight
    if (v.hoverPixelX >= 0 && v.hoverPixelY >= 0) {
      const blockPx = data.blocksPerPixel
      const worldX = data.originBlockX + v.hoverPixelX * blockPx
      const worldZ = data.originBlockZ + v.hoverPixelY * blockPx
      const blockScreenPx = v.scale / blockPx
      const blockMode = blockScreenPx >= BLOCK_MODE_MIN_PX

      ctx.save()
      ctx.lineWidth = Math.max(1.5 / v.scale, 1 / v.scale)
      ctx.strokeStyle = 'rgba(61, 214, 198, 0.95)'
      ctx.fillStyle = 'rgba(61, 214, 198, 0.18)'

      if (blockMode) {
        const bx = Math.floor(worldX)
        const bz = Math.floor(worldZ)
        const x0 = (bx - data.originBlockX) / blockPx
        const z0 = (bz - data.originBlockZ) / blockPx
        const s = 1 / blockPx
        ctx.fillRect(x0, z0, s, s)
        ctx.strokeRect(x0, z0, s, s)

        const hb = hoverBlockRef.current
        if (hb && hb.x === bx && hb.z === bz) {
          const fontPx = Math.max(20 / v.scale, 16 / v.scale)
          ctx.font = `700 ${fontPx}px sans-serif`
          ctx.textBaseline = 'middle'
          const label = hb.displayName
          const labelX = x0 + s + 4 / v.scale
          const labelY = z0 + s / 2
          ctx.lineJoin = 'round'
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          ctx.lineWidth = 5 / v.scale
          ctx.strokeText(label, labelX, labelY)
          ctx.strokeStyle = 'rgba(61, 214, 198, 0.95)'
          ctx.lineWidth = 3 / v.scale
          ctx.strokeText(label, labelX, labelY)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, labelX, labelY)
        }
      } else {
        const cx = Math.floor(worldX / 16)
        const cz = Math.floor(worldZ / 16)
        const x0 = (cx * 16 - data.originBlockX) / blockPx
        const z0 = (cz * 16 - data.originBlockZ) / blockPx
        const s = 16 / blockPx
        ctx.fillRect(x0, z0, s, s)
        ctx.strokeRect(x0, z0, s, s)
      }
      ctx.restore()
    }

    ctx.restore()
  }, [map])

  const updateHud = useCallback(() => {
    const data = map
    const v = viewRef.current
    if (!data || v.hoverPixelX < 0 || v.hoverPixelY < 0) {
      hoverBlockRef.current = null
      setHud({ coordText: '', caption: '', mode: 'chunk' })
      return
    }
    const blockPx = data.blocksPerPixel
    const worldX = data.originBlockX + v.hoverPixelX * blockPx
    const worldZ = data.originBlockZ + v.hoverPixelY * blockPx
    const blockScreenPx = v.scale / blockPx
    const blockMode = blockScreenPx >= BLOCK_MODE_MIN_PX
    const bx = Math.floor(worldX)
    const bz = Math.floor(worldZ)
    const cx = Math.floor(worldX / 16)
    const cz = Math.floor(worldZ / 16)

    const coordText = blockMode
      ? t('instance.map.coord.block', bx, bz)
      : t('instance.map.coord.chunk', cx, cz, bx, bz)

    let caption = ''
    const hitRadius = Math.max(blockPx * 3, 4)
    let bestWp: MapWaypoint | null = null
    let bestDist = Infinity
    for (const wp of data.waypoints) {
      const d = Math.hypot(wp.x - worldX, wp.z - worldZ)
      if (d < hitRadius && d < bestDist) {
        bestDist = d
        bestWp = wp
      }
    }
    if (bestWp) {
      caption =
        bestWp.kind === 'death'
          ? t('instance.map.caption.death', bestWp.name, bestWp.x, bestWp.y, bestWp.z)
          : t('instance.map.caption.waypoint', bestWp.name, bestWp.x, bestWp.y, bestWp.z)
    } else if (data.logoutPosition) {
      const d = Math.hypot(data.logoutPosition.x - worldX, data.logoutPosition.z - worldZ)
      if (d < hitRadius) {
        caption = t(
          'instance.map.caption.logout',
          data.logoutPosition.label,
          data.logoutPosition.x,
          data.logoutPosition.y,
          data.logoutPosition.z
        )
      }
    }

    if (blockMode) {
      const cached = hoverBlockRef.current
      if (cached && cached.x === bx && cached.z === bz) {
        if (!caption) caption = t('instance.map.caption.block', cached.blockId)
      } else {
        const seq = ++blockLookupSeq.current
        void window.awesomeAPI.lookupXaeroBlock(serverId, host, bx, bz).then((hit) => {
          if (seq !== blockLookupSeq.current) return
          if (!hit) {
            hoverBlockRef.current = null
            paint()
            return
          }
          hoverBlockRef.current = {
            x: bx,
            z: bz,
            displayName: hit.displayName,
            blockId: hit.blockId
          }
          setHud((prev) => ({
            ...prev,
            caption: prev.caption || t('instance.map.caption.block', hit.blockId)
          }))
          paint()
        })
      }
    } else {
      hoverBlockRef.current = null
    }

    setHud({ coordText, caption, mode: blockMode ? 'block' : 'chunk' })
  }, [map, serverId, host, paint])

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current
    const data = map
    if (!viewport || !data) return
    const pad = 24
    const sx = (viewport.clientWidth - pad * 2) / data.width
    const sy = (viewport.clientHeight - pad * 2) / data.height
    const scale = Math.min(sx, sy, 4)
    viewRef.current.scale = Math.max(scale, 0.05)
    viewRef.current.panX = (viewport.clientWidth - data.width * viewRef.current.scale) / 2
    viewRef.current.panY = (viewport.clientHeight - data.height * viewRef.current.scale) / 2
    paint()
  }, [map, paint])

  useEffect(() => {
    if (!map) return
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      fitToView()
    }
    img.src = map.dataUrl
    return () => {
      imageRef.current = null
    }
  }, [map, fitToView])

  useEffect(() => {
    if (!open) return
    const el = viewportRef.current
    if (!el) return
    const onWheelNative = (e: WheelEvent): void => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas || !map) return
      const rect = canvas.getBoundingClientRect()
      const v = viewRef.current
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const beforeX = (mx - v.panX) / v.scale
      const beforeY = (my - v.panY) / v.scale
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const next = Math.min(64, Math.max(0.05, v.scale * factor))
      v.scale = next
      v.panX = mx - beforeX * next
      v.panY = my - beforeY * next
      paint()
      updateHud()
    }
    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', onWheelNative)
  }, [open, map, paint, updateHud])

  useEffect(() => {
    if (!open) return
    const onResize = (): void => paint()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, paint])

  function toMapPixel(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current
    const data = map
    if (!canvas || !data) return null
    const rect = canvas.getBoundingClientRect()
    const v = viewRef.current
    const x = (clientX - rect.left - v.panX) / v.scale
    const y = (clientY - rect.top - v.panY) / v.scale
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null
    return { x, y }
  }

  function onPointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return
    const v = viewRef.current
    v.dragging = true
    v.lastX = e.clientX
    v.lastY = e.clientY
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent): void {
    const v = viewRef.current
    if (v.dragging) {
      v.panX += e.clientX - v.lastX
      v.panY += e.clientY - v.lastY
      v.lastX = e.clientX
      v.lastY = e.clientY
      paint()
    }
    const pixel = toMapPixel(e.clientX, e.clientY)
    if (pixel) {
      v.hoverPixelX = pixel.x
      v.hoverPixelY = pixel.y
    } else {
      v.hoverPixelX = -1
      v.hoverPixelY = -1
    }
    paint()
    updateHud()
  }

  function onPointerUp(e: React.PointerEvent): void {
    viewRef.current.dragging = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onPointerLeave(): void {
    viewRef.current.dragging = false
    viewRef.current.hoverPixelX = -1
    viewRef.current.hoverPixelY = -1
    paint()
    updateHud()
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel modal-map" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h2>{t('instance.map.title', serverName)}</h2>
          <div className="actions actions-compact" style={{ marginTop: 0 }}>
            {map ? (
              <button type="button" className="btn btn-sm" onClick={() => fitToView()}>
                {t('instance.map.fit')}
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              {t('settings.cancel')}
            </button>
          </div>
        </div>

        {loading ? <p className="muted">{t('instance.map.loading')}</p> : null}
        {error ? <p className="warn-box">{error}</p> : null}

        {map ? (
          <div className="map-stage">
            <div className="map-hud-top">
              <span>{hud.coordText || t('instance.map.coord.hint')}</span>
              <span className="muted">
                {t('instance.map.meta', map.regionCount, map.width, map.height)}
              </span>
            </div>
            <div
              className="map-viewer"
              ref={viewportRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
            >
              <canvas ref={canvasRef} className="map-canvas" />
            </div>
            <div className="map-hud-bottom">
              <span className="muted">{t('instance.map.controls')}</span>
              <span className="map-caption">{hud.caption || '—'}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

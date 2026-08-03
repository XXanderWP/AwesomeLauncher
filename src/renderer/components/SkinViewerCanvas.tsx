import { useEffect, useRef } from 'react'
import { SkinViewer, WalkingAnimation } from 'skinview3d'

interface Props {
  skinDataUrl: string | null
  width: number
  height: number
  enableControls?: boolean
  autoRotate?: boolean
  className?: string
}

export function SkinViewerCanvas({
  skinDataUrl,
  width,
  height,
  enableControls = false,
  autoRotate = false,
  className
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const skinRef = useRef(skinDataUrl)
  skinRef.current = skinDataUrl

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const viewer = new SkinViewer({
      canvas,
      width,
      height,
      enableControls,
      zoom: 0.82,
      fov: 50
    })
    viewer.controls.enablePan = false
    viewer.controls.enableZoom = enableControls
    viewer.controls.enableRotate = enableControls
    viewer.autoRotate = autoRotate
    viewer.autoRotateSpeed = 0.7

    const walk = new WalkingAnimation()
    walk.speed = enableControls ? 0.55 : 0.45
    viewer.animation = walk

    if (skinRef.current) {
      void viewer.loadSkin(skinRef.current).catch(() => {
        /* skin decode failures fall back to empty model */
      })
    }

    viewerRef.current = viewer
    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [enableControls, autoRotate, width, height])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !skinDataUrl) return
    void viewer.loadSkin(skinDataUrl).catch(() => {
      /* skin decode failures fall back to empty model */
    })
  }, [skinDataUrl])

  return (
    <canvas
      ref={canvasRef}
      className={`skin-viewer-canvas${className ? ` ${className}` : ''}`}
      width={width}
      height={height}
      aria-hidden
    />
  )
}

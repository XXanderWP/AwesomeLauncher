import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'
import { getElybySkinDataUrl } from '../skin/elybySkinCache'
import { ElybyAvatar } from './ElybyAvatar'
import { SkinPreviewModal } from './SkinPreviewModal'
import { SkinViewerCanvas } from './SkinViewerCanvas'

const HOVER_DELAY_MS = 1000
const TOOLTIP_W = 140
const TOOLTIP_H = 180
const TOOLTIP_GAP = 10

interface Props {
  username: string
  size?: number
  className?: string
}

function clampTooltipPosition(anchor: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = anchor.right + TOOLTIP_GAP
  if (left + TOOLTIP_W > vw - 8) {
    left = anchor.left - TOOLTIP_W - TOOLTIP_GAP
  }
  left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8))

  let top = anchor.top + anchor.height / 2 - TOOLTIP_H / 2
  top = Math.max(8, Math.min(top, vh - TOOLTIP_H - 8))
  return { top, left }
}

export function ElybyAvatarPreview({ username, size = 72, className }: Props): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const tooltipReqRef = useRef(0)
  const modalOpenRef = useRef(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const [tooltipSkin, setTooltipSkin] = useState<string | null>(null)
  const [tooltipLoading, setTooltipLoading] = useState(false)

  modalOpenRef.current = modalOpen

  const clearHoverTimer = useCallback((): void => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const hideTooltip = useCallback((): void => {
    clearHoverTimer()
    tooltipReqRef.current += 1
    setTooltipVisible(false)
    setTooltipSkin(null)
    setTooltipLoading(false)
  }, [clearHoverTimer])

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer])

  useEffect(() => {
    if (modalOpen) hideTooltip()
  }, [modalOpen, hideTooltip])

  function showTooltipSoon(): void {
    if (modalOpenRef.current) return
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      const el = triggerRef.current
      if (!el || modalOpenRef.current) return
      setTooltipPos(clampTooltipPosition(el.getBoundingClientRect()))
      setTooltipVisible(true)
      setTooltipLoading(true)
      setTooltipSkin(null)
      const req = ++tooltipReqRef.current
      void getElybySkinDataUrl(username).then((dataUrl) => {
        if (req !== tooltipReqRef.current) return
        setTooltipSkin(dataUrl)
        setTooltipLoading(false)
      })
    }, HOVER_DELAY_MS)
  }

  function openModal(): void {
    hideTooltip()
    setModalOpen(true)
  }

  const name = username.trim() || '?'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ely-avatar-preview-trigger"
        aria-label={t('skin.preview.open', name)}
        onMouseEnter={showTooltipSoon}
        onMouseLeave={hideTooltip}
        onClick={openModal}
      >
        <ElybyAvatar username={username} size={size} className={className} />
      </button>

      {tooltipVisible && !modalOpen
        ? createPortal(
            <div
              className="skin-preview-tooltip"
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
              role="tooltip"
            >
              {tooltipLoading ? (
                <div className="skin-preview-tooltip-loading" aria-hidden>
                  <div className="boot-spinner" />
                </div>
              ) : tooltipSkin ? (
                <SkinViewerCanvas
                  skinDataUrl={tooltipSkin}
                  width={TOOLTIP_W}
                  height={TOOLTIP_H}
                  enableControls={false}
                  autoRotate
                />
              ) : (
                <p className="muted skin-preview-tooltip-empty">{t('skin.preview.unavailable')}</p>
              )}
            </div>,
            document.body
          )
        : null}

      {modalOpen ? (
        <SkinPreviewModal username={username} onClose={() => setModalOpen(false)} />
      ) : null}
    </>
  )
}

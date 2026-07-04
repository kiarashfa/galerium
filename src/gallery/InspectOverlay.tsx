import { useEffect, useRef } from 'react'
import { useMuseum } from '../store'
import { asset } from '../data'
import { isTouchDevice } from '../touch'
import { clamp } from '../timeline/camera'
import { isRestricted, type Artist, type Painting, type Period } from '../types'

interface Props {
  painting: Painting
  artist: Artist
  period: Period | undefined
}

/** Hi-res lightbox with pan/zoom + the painting's story and facts. */
export default function InspectOverlay({ painting, artist, period }: Props) {
  const inspect = useMuseum((s) => s.inspect)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  // view state kept in refs; applied imperatively for smooth pan/zoom
  const view = useRef({ scale: 1, fit: 1, tx: 0, ty: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') inspect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspect])

  const apply = () => {
    const img = imgRef.current
    if (!img) return
    const { scale, tx, ty } = view.current
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }

  const fitImage = () => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img || !img.naturalWidth) return
    const sw = stage.clientWidth
    const sh = stage.clientHeight
    const fit = Math.min(sw / img.naturalWidth, sh / img.naturalHeight) * 0.92
    view.current.fit = fit
    view.current.scale = fit
    view.current.tx = (sw - img.naturalWidth * fit) / 2
    view.current.ty = (sh - img.naturalHeight * fit) / 2
    apply()
  }

  useEffect(() => {
    const stage = stageRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = view.current
      const rect = stage.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const s0 = v.scale
      const s1 = clamp(s0 * Math.exp(-e.deltaY * 0.0018), v.fit * 0.85, v.fit * 9)
      v.tx = sx - ((sx - v.tx) / s0) * s1
      v.ty = sy - ((sy - v.ty) / s0) * s1
      v.scale = s1
      apply()
    }
    // toggle between fit and 2.6x, anchored at (sx, sy) — used by desktop
    // double-click and mobile double-tap alike
    const zoomToggleAt = (sx: number, sy: number) => {
      const v = view.current
      const zoomed = v.scale > v.fit * 1.4
      const s1 = zoomed ? v.fit : v.fit * 2.6
      const s0 = v.scale
      v.tx = zoomed ? (stage.clientWidth - imgRef.current!.naturalWidth * s1) / 2 : sx - ((sx - v.tx) / s0) * s1
      v.ty = zoomed ? (stage.clientHeight - imgRef.current!.naturalHeight * s1) / 2 : sy - ((sy - v.ty) / s0) * s1
      v.scale = s1
      apply()
    }

    // one pointer pans; two pointers pinch-zoom about the moving midpoint
    const pts = new Map<number, { x: number; y: number }>()
    let lx = 0
    let ly = 0
    let moved = 0
    let pinchPrev = { d: 1, mx: 0, my: 0 }
    let lastTap = { t: 0, x: 0, y: 0 }

    const beginPinch = () => {
      const [a, b] = [...pts.values()]
      pinchPrev = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 20), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }
    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      try {
        stage.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic pointer */
      }
      stage.classList.add('dragging')
      if (pts.size === 2) beginPinch()
      else {
        lx = e.clientX
        ly = e.clientY
        moved = 0
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const v = view.current
      if (pts.size >= 2) {
        const rect = stage.getBoundingClientRect()
        const [a, b] = [...pts.values()]
        const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 20)
        const mx = (a.x + b.x) / 2 - rect.left
        const my = (a.y + b.y) / 2 - rect.top
        const s0 = v.scale
        const s1 = clamp((s0 * d) / pinchPrev.d, v.fit * 0.85, v.fit * 9)
        const pmx = pinchPrev.mx - rect.left
        const pmy = pinchPrev.my - rect.top
        v.tx = mx - ((pmx - v.tx) / s0) * s1
        v.ty = my - ((pmy - v.ty) / s0) * s1
        v.scale = s1
        pinchPrev = { d, mx: mx + rect.left, my: my + rect.top }
        apply()
        return
      }
      moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly)
      v.tx += e.clientX - lx
      v.ty += e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      apply()
    }
    const onUp = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      if (pts.size === 1) {
        const [p] = [...pts.values()]
        lx = p.x
        ly = p.y
        moved = 99 // a pinch tail shouldn't count as a tap
      }
      if (pts.size === 0) {
        stage.classList.remove('dragging')
        // manual double-tap (mobile browsers don't emit dblclick reliably here)
        if (e.pointerType === 'touch' && moved < 8) {
          const now = performance.now()
          const rect = stage.getBoundingClientRect()
          if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
            zoomToggleAt(e.clientX - rect.left, e.clientY - rect.top)
            lastTap = { t: 0, x: 0, y: 0 }
          } else {
            lastTap = { t: now, x: e.clientX, y: e.clientY }
          }
        }
      }
    }
    const onDbl = (e: MouseEvent) => {
      const rect = stage.getBoundingClientRect()
      zoomToggleAt(e.clientX - rect.left, e.clientY - rect.top)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    stage.addEventListener('dblclick', onDbl)
    window.addEventListener('resize', fitImage)
    return () => {
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('dblclick', onDbl)
      window.removeEventListener('resize', fitImage)
    }
  }, [])

  return (
    <div className="lightbox">
      <div ref={stageRef} className="lightbox-stage">
        <img
          ref={imgRef}
          src={asset(painting.image)}
          alt={painting.title}
          draggable={false}
          onLoad={fitImage}
        />
        <div className="lightbox-zoomhint">
          {isTouchDevice
            ? 'Pinch to zoom · drag to pan · double-tap to magnify'
            : 'Scroll to zoom · drag to pan · double-click to magnify'}
        </div>
      </div>
      <aside className="lightbox-panel">
        <button className="lightbox-close" onClick={() => inspect(null)} aria-label="Close">
          ×
        </button>
        <div className="lightbox-eyebrow">
          {period?.name} · {artist.name}
        </div>
        <h2 className="lightbox-title">{painting.title}</h2>
        <div className="lightbox-byline">{painting.yearText || 'Date unknown'}</div>
        {isRestricted(painting) && (
          <div className="lightbox-copyright">
            <span className="lightbox-copyright-badge">© In copyright</span>
            <span>
              Included for personal use only — not part of any public build.
              {painting.copyrightHolder ? ` Rights: ${painting.copyrightHolder}.` : ''}
            </span>
          </div>
        )}
        <div className="lightbox-rule" />
        <p className="lightbox-story">{painting.story}</p>
        {painting.facts.length > 0 && (
          <div className="lightbox-facts">
            <div className="lightbox-facts-title">From the record</div>
            <ul>
              {painting.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="lightbox-sources">
          <a href={painting.wikipediaUrl} target="_blank" rel="noreferrer">
            Wikipedia ↗
          </a>
          <a href={painting.commonsUrl} target="_blank" rel="noreferrer">
            {isRestricted(painting) ? 'File page (fair use) ↗' : `Commons (${painting.license}) ↗`}
          </a>
        </div>
      </aside>
    </div>
  )
}

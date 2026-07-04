import { useEffect, useMemo, useRef } from 'react'
import { useMuseum } from '../store'
import { asset } from '../data'
import { isTouchDevice } from '../touch'
import type { Artist, MuseumData, Period } from '../types'
import {
  type Cam,
  yearToX,
  xToYear,
  pxPerYear,
  K_MIN,
  K_MAX,
  ARTIST_IN_START,
  ARTIST_IN_END,
  clamp,
  smoothstep,
  easeInOutCubic,
  nodeScale,
  labelScale,
  seeded,
} from './camera'

// ---------------------------------------------------------------- layout ----

interface ArtistPos {
  artist: Artist
  x: number
  y: number
}
interface PeriodLayout {
  period: Period
  cx: number
  /** world-x extent of the period band (non-linear axis, so computed per edge) */
  x0: number
  x1: number
  centroid: { x: number; y: number }
  artists: ArtistPos[]
}

const Y_OFFSETS = [-72, 60, -10, 88, -98, 32, 108, -42]
// labels cycle six rows so temporally-close periods (nine between 1848 and
// 2020) never share a row with a near neighbour
const PERIOD_ROWS = [-290, 160, -80, 300, -190, 90]
const WORLD_Y_SPAN = 950

/** An artist sits at the median year of their paintings in the collection —
 *  the truest "when they worked" signal we have from the data. */
function artistYear(artist: Artist, data: MuseumData, period: Period): number {
  const years = artist.paintingIds
    .map((id) => data.paintingById.get(id)?.year)
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b)
  if (years.length) return years[Math.floor(years.length / 2)]
  if (artist.birthYear != null && artist.deathYear != null)
    return (artist.birthYear + 20 + artist.deathYear) / 2
  return (period.start + period.end) / 2
}

function computeLayout(data: MuseumData): PeriodLayout[] {
  return data.periods.map((period) => {
    const artists = data.artists
      .filter((a) => a.periodId === period.id)
      .map((artist, i) => ({
        artist,
        x: yearToX(artistYear(artist, data, period)),
        y: Y_OFFSETS[i % Y_OFFSETS.length],
      }))
    const x0 = yearToX(period.start)
    const x1 = yearToX(period.end)
    const cx = (x0 + x1) / 2
    const centroid = artists.length
      ? {
          // midpoint of the x extent (not the mean) so a temporal outlier stays on screen
          x: (Math.min(...artists.map((a) => a.x)) + Math.max(...artists.map((a) => a.x))) / 2,
          y: artists.reduce((s, a) => s + a.y, 0) / artists.length,
        }
      : { x: cx, y: 0 }
    return { period, cx, x0, x1, centroid, artists }
  })
}

// ---------------------------------------------------------------- component -

export default function Timeline() {
  const data = useMuseum((s) => s.data)!
  const filterPeriodId = useMuseum((s) => s.filterPeriodId)
  const flyReq = useMuseum((s) => s.flyToTarget)
  const openCard = useMuseum((s) => s.openCard)

  const layout = useMemo(() => computeLayout(data), [data])

  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const periodLayerRef = useRef<HTMLDivElement>(null)
  const artistLayerRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGGElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)

  // camera state lives in refs; rAF applies it imperatively (no re-renders)
  const camRef = useRef<Cam>({ x: yearToX(1660), y: 0, k: 0.7 })
  const targetRef = useRef<Cam>({ ...camRef.current })
  const flightRef = useRef<{ from: Cam; to: Cam; t0: number; dur: number } | null>(null)

  const stars = useMemo(
    () =>
      Array.from({ length: 340 }, (_, i) => ({
        x: yearToX(1210) + seeded(i) * (yearToX(2035) - yearToX(1210)),
        y: -WORLD_Y_SPAN + seeded(i + 1000) * WORLD_Y_SPAN * 2,
        r: 0.6 + seeded(i + 2000) * 1.4,
        o: 0.12 + seeded(i + 3000) * 0.4,
      })),
    [],
  )

  const svgX0 = yearToX(1210)
  const svgW = yearToX(2035) - svgX0
  const svgY0 = -WORLD_Y_SPAN
  const svgH = WORLD_Y_SPAN * 2

  const fitAll = (): Cam => {
    const vw = viewportRef.current?.clientWidth ?? 1280
    const minX = yearToX(data.periods[0].start) - 250
    const maxX = yearToX(data.periods[data.periods.length - 1].end) + 250
    return {
      x: (minX + maxX) / 2,
      y: -30,
      k: clamp(vw / (maxX - minX), K_MIN, 1.4),
    }
  }

  const flyTo = (to: Cam, dur = 950) => {
    flightRef.current = { from: { ...camRef.current }, to, t0: performance.now(), dur }
  }

  /** Zoom for a period fly-in: fit the artist cluster to the viewport, but always past the reveal threshold. */
  const periodZoom = (pl: PeriodLayout) => {
    const vw = viewportRef.current?.clientWidth ?? 1280
    const xs = pl.artists.map((a) => a.x)
    const span = Math.max(Math.max(...xs) - Math.min(...xs) + 220, 260)
    return clamp((vw * 0.85) / span, ARTIST_IN_END + 0.15, 3.9)
  }

  // main rAF loop -------------------------------------------------------------
  useEffect(() => {
    const viewport = viewportRef.current!
    const world = worldRef.current!
    let raf = 0
    let lastT = performance.now()

    // tick pool for the year axis
    const tickPool: HTMLDivElement[] = []
    const ensureTicks = (n: number) => {
      const axis = axisRef.current!
      while (tickPool.length < n) {
        const el = document.createElement('div')
        el.className = 'tl-tick'
        el.innerHTML = '<span></span><label></label>'
        axis.appendChild(el)
        tickPool.push(el)
      }
      return tickPool
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((t - lastT) / 1000, 0.1)
      lastT = t
      const cam = camRef.current
      const target = targetRef.current

      if (flightRef.current) {
        const f = flightRef.current
        const p = clamp((t - f.t0) / f.dur, 0, 1)
        const e = easeInOutCubic(p)
        // zoom interpolates in log space so long flights feel even
        cam.x = f.from.x + (f.to.x - f.from.x) * e
        cam.y = f.from.y + (f.to.y - f.from.y) * e
        cam.k = Math.exp(Math.log(f.from.k) + (Math.log(f.to.k) - Math.log(f.from.k)) * e)
        target.x = cam.x
        target.y = cam.y
        target.k = cam.k
        if (p >= 1) flightRef.current = null
      } else {
        const s = 1 - Math.exp(-dt * 11)
        cam.x += (target.x - cam.x) * s
        cam.y += (target.y - cam.y) * s
        cam.k = Math.exp(Math.log(cam.k) + (Math.log(target.k) - Math.log(cam.k)) * s)
      }

      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      const { x, y, k } = cam
      const tx = vw / 2 - x * k
      const ty = vh / 2 - y * k
      world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`
      world.style.setProperty('--node-scale', String(nodeScale(k)))
      world.style.setProperty('--label-scale', String(labelScale(k)))

      // semantic zoom crossfade
      const artistOp = smoothstep(ARTIST_IN_START, ARTIST_IN_END, k)
      const periodOp = 1 - artistOp * 0.72
      if (artistLayerRef.current) {
        artistLayerRef.current.style.opacity = String(artistOp)
        artistLayerRef.current.style.pointerEvents = artistOp > 0.45 ? 'auto' : 'none'
      }
      if (periodLayerRef.current) periodLayerRef.current.style.opacity = String(periodOp)
      if (linesRef.current) linesRef.current.style.opacity = String(artistOp * 0.55)

      // year axis — the time axis is non-linear, so ticks are placed with a
      // variable step: at each position the step comes from the local px/year
      // density, keeping ~90px spacing everywhere (like a log-scale axis)
      const axis = axisRef.current
      if (axis) {
        const STEPS = [5, 10, 25, 50, 100, 250, 500]
        const yearR = Math.min(xToYear((vw - tx) / k), 2100)
        let year = Math.max(xToYear(-tx / k), 1000)
        const pool = ensureTicks(60)
        let i = 0
        let guard = 0
        while (year <= yearR && i < pool.length && guard++ < 200) {
          const density = pxPerYear(Math.max(year, 1160)) * k
          const step = STEPS.find((s) => s * density >= 90) ?? 500
          const snapped = Math.ceil(year / step) * step
          if (snapped > yearR) break
          const el = pool[i++]
          const sx = yearToX(snapped) * k + tx
          el.style.transform = `translateX(${sx}px)`
          el.style.opacity = '1'
          const label = el.querySelector('label')!
          if (label.textContent !== String(snapped)) label.textContent = String(snapped)
          // advance minimally — the next tick's step is chosen from the local
          // density just past this tick, so spacing adapts along the axis
          year = snapped + 1
        }
        for (; i < pool.length; i++) pool[i].style.opacity = '0'
      }
    }
    raf = requestAnimationFrame(frame)

    // initial fit
    const start = fitAll()
    camRef.current = { ...start, k: start.k * 0.8 }
    targetRef.current = { ...start }

    return () => {
      cancelAnimationFrame(raf)
      // remove imperative tick elements (StrictMode remounts would orphan them)
      for (const el of tickPool) el.remove()
      tickPool.length = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // input handlers ------------------------------------------------------------
  useEffect(() => {
    const viewport = viewportRef.current!

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      flightRef.current = null
      const target = targetRef.current
      const rect = viewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const vw = rect.width
      const vh = rect.height
      const k0 = target.k
      const k1 = clamp(k0 * Math.exp(-e.deltaY * 0.0016), K_MIN, K_MAX)
      // keep the world point under the cursor stationary
      const wx = target.x + (sx - vw / 2) / k0
      const wy = target.y + (sy - vh / 2) / k0
      target.x = wx - (sx - vw / 2) / k1
      target.y = wy - (sy - vh / 2) / k1
      target.k = k1
    }

    // Multi-pointer input: mouse/touch drag pans (after a small threshold so
    // node clicks aren't swallowed by capture); two touches pinch-zoom about
    // the moving midpoint.
    const pts = new Map<number, { x: number; y: number }>()
    let mode: 'idle' | 'pending' | 'drag' | 'pinch' = 'idle'
    let lastX = 0
    let lastY = 0
    let pinchPrev = { d: 1, mx: 0, my: 0 }

    const beginPinch = () => {
      const [a, b] = [...pts.values()]
      pinchPrev = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 20), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      mode = 'pinch'
      flightRef.current = null
      for (const id of pts.keys()) {
        try {
          viewport.setPointerCapture(id)
        } catch {
          /* pointer already gone */
        }
      }
      viewport.classList.add('dragging')
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) {
        mode = 'pending'
        lastX = e.clientX
        lastY = e.clientY
      } else if (pts.size === 2) {
        beginPinch()
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const target = targetRef.current
      const cam = camRef.current

      if (mode === 'pinch' && pts.size >= 2) {
        const rect = viewport.getBoundingClientRect()
        const [a, b] = [...pts.values()]
        const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 20)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const k0 = target.k
        const k1 = clamp((k0 * d) / pinchPrev.d, K_MIN, K_MAX)
        // pin the world point that was under the previous midpoint to the new one
        const wx = target.x + (pinchPrev.mx - rect.left - rect.width / 2) / k0
        const wy = target.y + (pinchPrev.my - rect.top - rect.height / 2) / k0
        target.x = wx - (mx - rect.left - rect.width / 2) / k1
        target.y = wy - (my - rect.top - rect.height / 2) / k1
        target.k = k1
        cam.x = target.x
        cam.y = target.y
        cam.k = k1 // 1:1 with the fingers, no smoothing lag
        pinchPrev = { d, mx, my }
        return
      }

      if (mode !== 'pending' && mode !== 'drag') return
      const dxs = e.clientX - lastX
      const dys = e.clientY - lastY
      if (mode === 'pending') {
        if (Math.abs(dxs) + Math.abs(dys) < 4) return
        mode = 'drag'
        try {
          viewport.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
        viewport.classList.add('dragging')
      }
      flightRef.current = null
      const dx = dxs / cam.k
      const dy = dys / cam.k
      lastX = e.clientX
      lastY = e.clientY
      target.x -= dx
      target.y -= dy
      cam.x -= dx
      cam.y -= dy
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      try {
        viewport.releasePointerCapture(e.pointerId)
      } catch {
        /* not captured */
      }
      if (mode === 'pinch') {
        if (pts.size >= 2) {
          beginPinch()
          return
        }
        if (pts.size === 1) {
          // one finger lifted: continue as a pan with the remaining finger
          const [p] = [...pts.values()]
          mode = 'drag'
          lastX = p.x
          lastY = p.y
          return
        }
      }
      if (pts.size === 0) {
        mode = 'idle'
        viewport.classList.remove('dragging')
      }
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    viewport.addEventListener('pointerdown', onPointerDown)
    viewport.addEventListener('pointermove', onPointerMove)
    viewport.addEventListener('pointerup', onPointerUp)
    viewport.addEventListener('pointercancel', onPointerUp)
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('pointerdown', onPointerDown)
      viewport.removeEventListener('pointermove', onPointerMove)
      viewport.removeEventListener('pointerup', onPointerUp)
      viewport.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  // fly-to requests from the filter bar / cards --------------------------------
  useEffect(() => {
    if (!flyReq) return
    if (flyReq.kind === 'home') {
      flyTo(fitAll(), 1100)
      return
    }
    if (flyReq.kind === 'period') {
      const pl = layout.find((l) => l.period.id === flyReq.id)
      if (pl) flyTo({ x: pl.centroid.x, y: pl.centroid.y, k: periodZoom(pl) }, 1100)
      return
    }
    const pos = layout.flatMap((l) => l.artists).find((a) => a.artist.id === flyReq.id)
    if (pos) flyTo({ x: pos.x, y: pos.y, k: 3.9 }, 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyReq])

  const onArtistClick = (a: ArtistPos) => {
    flyTo({ x: a.x, y: a.y, k: Math.max(camRef.current.k, 3.9) }, 850)
    window.setTimeout(() => openCard(a.artist.id), 700)
  }

  const onPeriodClick = (pl: PeriodLayout) => {
    flyTo({ x: pl.centroid.x, y: pl.centroid.y, k: periodZoom(pl) }, 1100)
  }

  const dimmed = (periodId: string) => (filterPeriodId != null && periodId !== filterPeriodId ? ' is-dim' : '')

  return (
    <div ref={viewportRef} className="timeline" role="application" aria-label="Art history timeline">
      <div ref={worldRef} className="tl-world">
        <svg
          className="tl-svg"
          style={{ left: svgX0, top: svgY0, width: svgW, height: svgH }}
          viewBox={`0 0 ${svgW} ${svgH}`}
        >
          {stars.map((s, i) => (
            <circle key={i} cx={s.x - svgX0} cy={s.y - svgY0} r={s.r} fill="#cdd4e8" opacity={s.o} />
          ))}
          <g ref={linesRef} style={{ opacity: 0 }}>
            {layout.map((pl) => {
              const pts = [...pl.artists].sort((a, b) => a.x - b.x)
              return (
                <polyline
                  key={pl.period.id}
                  className={`tl-line${dimmed(pl.period.id)}`}
                  points={pts.map((p) => `${p.x - svgX0},${p.y - svgY0}`).join(' ')}
                  fill="none"
                  stroke={pl.period.color}
                  strokeWidth={1.2}
                  strokeDasharray="1 7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </g>
        </svg>

        {/* period halos: world-scaled soft regions */}
        {layout.map((pl) => (
          <div
            key={`halo-${pl.period.id}`}
            className={`tl-halo${dimmed(pl.period.id)}`}
            style={{
              left: pl.x0 - 60,
              top: -430,
              width: pl.x1 - pl.x0 + 120,
              height: 860,
              background: `radial-gradient(ellipse closest-side, ${pl.period.color}2e, ${pl.period.color}14 55%, transparent 72%)`,
            }}
          />
        ))}

        {/* period constellation labels */}
        <div ref={periodLayerRef}>
          {layout.map((pl, pi) => (
            <div
              key={pl.period.id}
              className={`tl-period${dimmed(pl.period.id)}`}
              style={{ left: pl.cx, top: PERIOD_ROWS[pi % PERIOD_ROWS.length] }}
            >
              <button className="tl-period-inner" onClick={() => onPeriodClick(pl)}>
                <span className="tl-period-star" style={{ background: pl.period.color, boxShadow: `0 0 18px 4px ${pl.period.color}88` }} />
                <span className="tl-period-name">{pl.period.name}</span>
                <span className="tl-period-dates">
                  {pl.period.start} – {pl.period.end}
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* artist nodes */}
        <div ref={artistLayerRef} style={{ opacity: 0, pointerEvents: 'none' }}>
          {layout.flatMap((pl) =>
            pl.artists.map((a) => (
              <div key={a.artist.id} className={`tl-artist${dimmed(pl.period.id)}`} style={{ left: a.x, top: a.y }}>
                <button
                  className="tl-artist-inner"
                  onClick={() => onArtistClick(a)}
                  aria-label={`Open card for ${a.artist.name}`}
                >
                  <span className="tl-artist-ring" style={{ borderColor: pl.period.color, boxShadow: `0 0 22px ${pl.period.color}55` }}>
                    {a.artist.portrait ? (
                      <img src={asset(a.artist.portrait)} alt="" draggable={false} />
                    ) : (
                      <span className="tl-artist-initial">{a.artist.name[0]}</span>
                    )}
                  </span>
                  <span className="tl-artist-name">{a.artist.name}</span>
                  <span className="tl-artist-dates">
                    {a.artist.birthYear ?? '—'}–{a.artist.deathYear ?? '—'}
                  </span>
                </button>
              </div>
            )),
          )}
        </div>
      </div>

      <div ref={axisRef} className="tl-axis" />
      <div className="tl-hint">
        {isTouchDevice
          ? 'Pinch to zoom · drag to pan · tap a period to open it'
          : 'Scroll to zoom · drag to pan · click a period to open it'}
      </div>
    </div>
  )
}

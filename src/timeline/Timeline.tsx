import { useEffect, useMemo, useRef } from 'react'
import { useMuseum } from '../store'
import { isTouchDevice } from '../touch'
import type { Artist, MuseumData, Period } from '../types'
import {
  type Cam,
  K_MIN,
  K_MAX,
  ROOM_IN_START,
  ROOM_IN_END,
  clamp,
  smoothstep,
  easeInOutCubic,
  roman,
} from './camera'

// ------------------------------------------------------------- world layout -
// The museum section: fifteen fixed-size floor slabs stacked chronologically,
// ground floor (Medieval & Gothic) at the bottom. Rooms are standardized —
// their size never encodes collection size — and sit along each floor at the
// position of the artist's real working years.

const SLAB_W = 1150
const SLAB_H = 232
const GAP = 44
const BAND_H = 52
const ROOM_W = 150
const ROOM_H = 104
const ROOM_GAP = 14
const EDGE_PAD = 70

interface RoomPos {
  artist: Artist
  x: number
  y: number
  number: string
  years: string
}
interface FloorLayout {
  period: Period
  index: number // 0 = ground floor (earliest period)
  y: number // world y of slab top
  rooms: RoomPos[]
  ticks: { x: number; year: number }[]
}

/** An artist's place on the floor: the median year of their paintings in the
 *  collection — the truest "when they worked" signal the data has. */
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

function computeFloors(data: MuseumData): FloorLayout[] {
  const n = data.periods.length
  return data.periods.map((period, index) => {
    const y = (n - 1 - index) * (SLAB_H + GAP)
    const span = Math.max(period.end - period.start, 1)
    const usable = SLAB_W - EDGE_PAD * 2

    const artists = data.artists
      .filter((a) => a.periodId === period.id)
      .map((artist) => ({ artist, year: artistYear(artist, data, period) }))
      .sort((a, b) => a.year - b.year)

    // ideal chronological x, then minimal nudges so uniform rooms never overlap
    const xs = artists.map(({ year }) => {
      const t = clamp((year - period.start) / span, 0, 1)
      return clamp(EDGE_PAD + t * usable - ROOM_W / 2, 16, SLAB_W - ROOM_W - 16)
    })
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + ROOM_W + ROOM_GAP)
    xs[xs.length - 1] = Math.min(xs[xs.length - 1] ?? 0, SLAB_W - ROOM_W - 16)
    for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - ROOM_W - ROOM_GAP)

    const rooms: RoomPos[] = artists.map(({ artist }, i) => ({
      artist,
      x: xs[i],
      y: BAND_H + 12 + (i % 2) * 16,
      number: `${index + 1}${String(i + 1).padStart(2, '0')}`,
      years: `${artist.birthYear ?? '—'}–${artist.deathYear ?? '—'}`,
    }))

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const year = Math.round(period.start + (span * i) / 4)
      return { x: EDGE_PAD + (usable * i) / 4, year }
    })

    return { period, index, y, rooms, ticks }
  })
}

// ------------------------------------------------------------- component ----

export default function Timeline() {
  const data = useMuseum((s) => s.data)!
  const filterPeriodId = useMuseum((s) => s.filterPeriodId)
  const flyReq = useMuseum((s) => s.flyToTarget)
  const openCard = useMuseum((s) => s.openCard)

  const floors = useMemo(() => computeFloors(data), [data])
  const worldH = floors.length * (SLAB_H + GAP) - GAP

  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const slabRefs = useRef<(HTMLDivElement | null)[]>([])
  const railRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hereRef = useRef(-1)

  const camRef = useRef<Cam>({ x: SLAB_W / 2, y: worldH / 2, k: 0.2 })
  const targetRef = useRef<Cam>({ ...camRef.current })
  const flightRef = useRef<{ from: Cam; to: Cam; t0: number; dur: number } | null>(null)

  // Home view: fit the building's width and stand at the ground-floor
  // entrance (Medieval & Gothic, at the bottom) — visitors pan upward through
  // history; the rail jumps straight to any floor.
  const fitAll = (): Cam => {
    const vw = viewportRef.current?.clientWidth ?? 1280
    return {
      x: SLAB_W / 2,
      y: worldH, // clamped to the bottom of the building by the camera bounds
      k: clamp((vw * 0.42) / SLAB_W, 0.16, 0.8),
    }
  }

  /** Width taken by the wayfinding rail (0 when hidden on small screens). */
  const railW = () => {
    const el = railRef.current
    return el && el.offsetWidth > 0 ? el.offsetWidth + 60 : 0
  }

  const flyTo = (to: Cam, dur = 950) => {
    flightRef.current = { from: { ...camRef.current }, to, t0: performance.now(), dur }
  }

  /** Frame a floor in the space right of the rail, always past room reveal. */
  const floorZoom = () => {
    const vw = (viewportRef.current?.clientWidth ?? 1280) - railW()
    return clamp((vw * 0.92) / SLAB_W, 0.95, 2.2)
  }
  const flyToFloor = (f: FloorLayout, dur = 1000) => {
    const k = floorZoom()
    flyTo({ x: SLAB_W / 2 - railW() / (2 * k), y: f.y + SLAB_H / 2, k }, dur)
  }

  // ------------------------------------------------------------ frame loop --
  useEffect(() => {
    const viewport = viewportRef.current!
    const world = worldRef.current!
    let raf = 0
    let lastT = performance.now()
    let roomsLive = false

    const clampCam = (c: Cam) => {
      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      const hw = vw / 2 / c.k
      const hh = vh / 2 / c.k
      const rw = railW() / c.k // keep content clear of the wayfinding rail
      const M = 120
      c.x = hw >= SLAB_W / 2 + M ? SLAB_W / 2 - rw / 2 : clamp(c.x, -M + hw - rw, SLAB_W + M - hw)
      c.y = hh >= worldH / 2 + M ? worldH / 2 : clamp(c.y, -M + hh, worldH + M - hh)
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
        cam.x = f.from.x + (f.to.x - f.from.x) * e
        cam.y = f.from.y + (f.to.y - f.from.y) * e
        cam.k = Math.exp(Math.log(f.from.k) + (Math.log(f.to.k) - Math.log(f.from.k)) * e)
        Object.assign(target, cam)
        if (p >= 1) flightRef.current = null
      } else {
        clampCam(target)
        const s = 1 - Math.exp(-dt * 11)
        cam.x += (target.x - cam.x) * s
        cam.y += (target.y - cam.y) * s
        cam.k = Math.exp(Math.log(cam.k) + (Math.log(target.k) - Math.log(cam.k)) * s)
      }
      clampCam(cam)

      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      const { x, y, k } = cam
      world.style.transform = `translate3d(${vw / 2 - x * k}px, ${vh / 2 - y * k}px, 0) scale(${k})`

      // semantic reveal of rooms + per-floor date rules
      const reveal = smoothstep(ROOM_IN_START, ROOM_IN_END, k)
      world.style.setProperty('--room-reveal', String(reveal))
      // floor bands stay readable however far out the camera is
      world.style.setProperty('--band-scale', String(Math.max(1, 0.55 / k)))
      const live = reveal > 0.5
      if (live !== roomsLive) {
        roomsLive = live
        world.classList.toggle('rooms-live', live)
      }

      // "you are here": the floor nearest the viewport centre once zoomed in
      let here = -1
      if (k >= ROOM_IN_START) {
        const idx = Math.round((worldH - y - SLAB_H / 2) / (SLAB_H + GAP))
        here = clamp(idx, 0, floors.length - 1)
      }
      if (here !== hereRef.current) {
        hereRef.current = here
        slabRefs.current.forEach((el, i) => el?.classList.toggle('is-here', i === here))
        railRefs.current.forEach((el, i) => el?.classList.toggle('is-here', i === here))
      }
    }
    raf = requestAnimationFrame(frame)

    const start = fitAll()
    camRef.current = { ...start, k: start.k * 0.82 }
    targetRef.current = { ...start }

    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------- input ---------
  useEffect(() => {
    const viewport = viewportRef.current!

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      flightRef.current = null
      const target = targetRef.current
      const rect = viewport.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const k0 = target.k
      const k1 = clamp(k0 * Math.exp(-e.deltaY * 0.0016), K_MIN, K_MAX)
      const wx = target.x + (sx - rect.width / 2) / k0
      const wy = target.y + (sy - rect.height / 2) / k0
      target.x = wx - (sx - rect.width / 2) / k1
      target.y = wy - (sy - rect.height / 2) / k1
      target.k = k1
    }

    // Multi-pointer input: drag pans (after a threshold so room/band clicks
    // survive), two touches pinch-zoom about the moving midpoint.
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
          /* synthetic pointer */
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
        const wx = target.x + (pinchPrev.mx - rect.left - rect.width / 2) / k0
        const wy = target.y + (pinchPrev.my - rect.top - rect.height / 2) / k0
        target.x = wx - (mx - rect.left - rect.width / 2) / k1
        target.y = wy - (my - rect.top - rect.height / 2) / k1
        target.k = k1
        Object.assign(cam, target)
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
          /* synthetic pointer */
        }
        viewport.classList.add('dragging')
      }
      flightRef.current = null
      lastX = e.clientX
      lastY = e.clientY
      target.x -= dxs / cam.k
      target.y -= dys / cam.k
      cam.x -= dxs / cam.k
      cam.y -= dys / cam.k
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

  // ------------------------------------------------- filter fly-to requests -
  useEffect(() => {
    if (!flyReq) return
    if (flyReq.kind === 'home') {
      flyTo(fitAll(), 1100)
      return
    }
    if (flyReq.kind === 'period') {
      const f = floors.find((fl) => fl.period.id === flyReq.id)
      if (f) flyToFloor(f, 1100)
      return
    }
    for (const f of floors) {
      const room = f.rooms.find((r) => r.artist.id === flyReq.id)
      if (room) {
        flyTo({ x: room.x + ROOM_W / 2, y: f.y + room.y + ROOM_H / 2, k: Math.max(floorZoom(), 1.15) }, 1000)
        return
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyReq])

  const onRoomClick = (f: FloorLayout, room: RoomPos) => {
    flyTo({ x: room.x + ROOM_W / 2, y: f.y + room.y + ROOM_H / 2, k: Math.max(camRef.current.k, 1.15) }, 700)
    window.setTimeout(() => openCard(room.artist.id), 480)
  }

  const dimmed = (periodId: string) => (filterPeriodId != null && periodId !== filterPeriodId ? ' is-dim' : '')

  return (
    <div ref={viewportRef} className="floorplan" role="application" aria-label="Museum floor plan timeline">
      <div ref={worldRef} className="fp-world" style={{ width: SLAB_W }}>
        {floors.map((f) => (
          <div
            key={f.period.id}
            ref={(el) => (slabRefs.current[f.index] = el)}
            className={`fp-floor${dimmed(f.period.id)}`}
            style={{ top: f.y, height: SLAB_H, ['--pc' as string]: f.period.color }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.fp-room')) return
              flyToFloor(f)
            }}
          >
            <div className="fp-band" style={{ height: BAND_H }}>
              <div className="fp-band-inner">
                <span className="fp-fnum">{roman(f.index + 1)}</span>
                <span className="fp-fname">{f.period.name}</span>
                <span className="fp-fyears">
                  {f.period.start} – {f.period.end}
                </span>
              </div>
              <span className="fp-here-chip">◉ You are here</span>
            </div>

            {f.rooms.map((room) => (
              <button
                key={room.artist.id}
                className="fp-room"
                style={{ left: room.x, top: room.y, width: ROOM_W, height: ROOM_H }}
                onClick={() => onRoomClick(f, room)}
                aria-label={`Open card for ${room.artist.name}`}
              >
                <span className="fp-rnum">{room.number}</span>
                <span className="fp-rname">{room.artist.name}</span>
                <span className="fp-rdates">{room.years}</span>
              </button>
            ))}

            <div className="fp-rule">
              {f.ticks.map((tk) => (
                <span key={tk.year} className="fp-tick" style={{ left: tk.x }}>
                  {tk.year}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* screen-fixed floor index — the wayfinding rail */}
      <nav ref={railRef} className="fp-rail" aria-label="Floor index">
        <div className="fp-rail-title">Floors</div>
        {[...floors].reverse().map((f) => (
          <button
            key={f.period.id}
            ref={(el) => (railRefs.current[f.index] = el)}
            className={`fp-rail-item${dimmed(f.period.id)}`}
            onClick={() => flyToFloor(f)}
          >
            <b>{roman(f.index + 1)}</b>
            <i style={{ background: f.period.color }} />
            <span>{f.period.name}</span>
          </button>
        ))}
      </nav>

      <div className="fp-hint">
        {isTouchDevice
          ? 'Pinch to zoom · drag to pan · tap a floor to open it'
          : 'Scroll to zoom · drag to pan · click a floor to open it'}
      </div>
    </div>
  )
}

// Camera model for the floor-plan timeline: a pannable/zoomable 2D world
// holding the museum section (fifteen stacked floor slabs).

export interface Cam {
  x: number
  y: number
  k: number
}

export const K_MIN = 0.14
export const K_MAX = 3.2

// Semantic reveal: below START the slabs show only their edge bands; past END
// the artist rooms (and per-floor date rules) are fully visible and tappable.
export const ROOM_IN_START = 0.5
export const ROOM_IN_END = 0.85

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
export const roman = (n: number) => ROMAN[n - 1] ?? String(n)

// World-space model for the infinite-canvas timeline.
// x is linear in years; y is free layout space; k is zoom.

export interface Cam {
  x: number
  y: number
  k: number
}

// Mildly non-linear time axis: px/year grows toward the present so the dense
// modern periods (nine between 1848 and 2020) get room while Medieval–Baroque
// centuries stay compact. Ordering and tick years remain strictly real dates.
const T0 = 1150
const T_POW = 1.75
const T_SCALE = 0.0377
export const yearToX = (year: number) => Math.pow(Math.max(year - T0, 1), T_POW) * T_SCALE
export const xToYear = (x: number) => Math.pow(Math.max(x, 0.01) / T_SCALE, 1 / T_POW) + T0
/** Local pixel density (world px per year) at a given year. */
export const pxPerYear = (year: number) => yearToX(year + 0.5) - yearToX(year - 0.5)

export const K_MIN = 0.12
export const K_MAX = 9
// Semantic-zoom band where period view dissolves into artist constellations.
export const ARTIST_IN_START = 1.1
export const ARTIST_IN_END = 1.72

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/** Screen-size compensation: nodes keep near-constant size with gentle growth as you zoom. */
export const nodeScale = (k: number) => (1.12 + 0.3 * Math.log2(clamp(k, 0.5, K_MAX))) / k

/** Period labels additionally shrink when far out so temporally-close periods don't collide. */
export const labelScale = (k: number) => nodeScale(k) * (0.52 + 0.48 * smoothstep(0.18, 1.3, k))

/** Deterministic pseudo-random in [0,1) for star placement. */
export function seeded(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

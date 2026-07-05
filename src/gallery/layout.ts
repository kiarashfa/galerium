import type { Painting, RoomTier } from '../types'

export type { RoomTier }

export interface Placement {
  painting: Painting
  /** center of the canvas in world space */
  position: [number, number, number]
  /** rotation around Y so the canvas faces into the room */
  rotationY: number
  /** wall normal pointing into the room */
  normal: [number, number, number]
  width: number
  height: number
}

export interface RoomSpec {
  width: number // x extent (short walls)
  depth: number // z extent (long walls)
  height: number
  placements: Placement[]
  spawn: [number, number, number]
  doorWidth: number
  doorHeight: number
}

export const EYE_HEIGHT = 1.7
const HANG_HEIGHT = 1.62

/** Three fixed room sizes replacing the old single 10×26 room. Same width,
 *  height, materials, spacing, door and placard across all three — only the
 *  length (depth) grows, so it reads as "the same museum, bigger wing." Sized so
 *  each tier fits its whole bracket at readable STD_SPACING on the two long
 *  walls (no painting compression, no entrance-wall hanging):
 *    small  1–7  → 4 slots/wall (8 ≥ 7)
 *    medium 8–14 → 7 slots/wall (14)
 *    large  15–20→ 10 slots/wall (20)
 *  Deliberately NOT continuously data-driven within a tier: rooms stay stable,
 *  memorable places as the collection grows (same rule as the timeline rooms). */
const TIER_DIMS: Record<RoomTier, { width: number; depth: number; height: number }> = {
  small: { width: 10, depth: 20, height: 4.3 },
  medium: { width: 10, depth: 30, height: 4.3 },
  large: { width: 10, depth: 40, height: 4.3 },
}

/** Which tier a painting count falls into (used to assign the stored tier). */
export function tierForCount(count: number): RoomTier {
  if (count >= 15) return 'large'
  if (count >= 8) return 'medium'
  return 'small'
}

const ENTRANCE_PAD = 4.5 // door wall → first painting (clears the door + notices)
const PLACARD_PAD = 3.6 // last painting → placard wall
const STD_SPACING = 3.5 // center-to-center on a wall; readable for works up to 3.1m wide

/** Display size for a painting from its aspect ratio (real dims are unknown). */
function displaySize(aspect: number): { width: number; height: number } {
  let height = Math.min(2.05, Math.max(1.15, 1.85 / Math.sqrt(aspect)))
  let width = height * aspect
  if (width > 3.1) {
    width = 3.1
    height = width / aspect
  }
  return { width, height }
}

export function computeRoom(paintings: Painting[], tier: RoomTier): RoomSpec {
  const { width, depth, height } = TIER_DIMS[tier]
  const n = paintings.length

  // paintings alternate right/left long walls walking in from the entrance;
  // slots use standard spacing anchored at the entrance end, so an artist with
  // few works greets you immediately and later works append down the room. The
  // tier is sized so its whole bracket fits at STD_SPACING; the Math.min below
  // is only a safety net if an artist is ever pushed past the tier's capacity.
  const slotsPerWall = Math.ceil(n / 2)
  const firstSlotZ = depth / 2 - ENTRANCE_PAD
  const lastSlotZ = -depth / 2 + PLACARD_PAD
  const usable = firstSlotZ - lastSlotZ
  const spacing = slotsPerWall > 1 ? Math.min(STD_SPACING, usable / (slotsPerWall - 1)) : STD_SPACING

  const placements: Placement[] = paintings.map((painting, i) => {
    const right = i % 2 === 0 // first painting on the right as you walk in
    const slot = Math.floor(i / 2)
    const z = firstSlotZ - slot * spacing
    const { width: w, height: h } = displaySize(painting.aspect)
    return {
      painting,
      position: right ? [width / 2 - 0.01, HANG_HEIGHT, z] : [-width / 2 + 0.01, HANG_HEIGHT, z],
      rotationY: right ? -Math.PI / 2 : Math.PI / 2,
      normal: right ? [-1, 0, 0] : [1, 0, 0],
      width: w,
      height: h,
    }
  })

  return {
    width,
    depth,
    height,
    placements,
    spawn: [0, EYE_HEIGHT, depth / 2 - 1.6],
    doorWidth: 2.6,
    doorHeight: 2.9,
  }
}

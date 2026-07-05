import type { Painting } from '../types'

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

// Fixed room — a long museum wing. Deliberately NOT data-driven: the room must
// stay a stable, memorable place as the collection grows (same rule as the
// timeline's standardized rooms). Entrance door on the +z short wall, grand
// artist placard on the -z short wall, paintings down the two long walls.
export const ROOM_W = 10
export const ROOM_D = 26
export const ROOM_H = 4.3

/** slots per long wall at standard spacing */
const FIRST_SLOT_Z = ROOM_D / 2 - 4.5 // first painting shortly past the door
const LAST_SLOT_Z = -ROOM_D / 2 + 3.6 // keep clear of the placard wall
const STD_SPACING = 3.5

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

export function computeRoom(paintings: Painting[]): RoomSpec {
  const n = paintings.length
  // paintings alternate right/left walls walking in from the entrance; slots
  // use standard spacing anchored at the entrance end, so an artist with few
  // works greets you immediately and new works later append down the room.
  // Only if an artist exceeds capacity does the spacing compress to fit.
  const slotsPerWall = Math.ceil(n / 2)
  const usable = FIRST_SLOT_Z - LAST_SLOT_Z
  const spacing = slotsPerWall > 1 ? Math.min(STD_SPACING, usable / (slotsPerWall - 1)) : STD_SPACING

  const placements: Placement[] = paintings.map((painting, i) => {
    const right = i % 2 === 0 // first painting on the right as you walk in
    const slot = Math.floor(i / 2)
    const z = FIRST_SLOT_Z - slot * spacing
    const { width, height } = displaySize(painting.aspect)
    return {
      painting,
      position: right ? [ROOM_W / 2 - 0.01, HANG_HEIGHT, z] : [-ROOM_W / 2 + 0.01, HANG_HEIGHT, z],
      rotationY: right ? -Math.PI / 2 : Math.PI / 2,
      normal: right ? [-1, 0, 0] : [1, 0, 0],
      width,
      height,
    }
  })

  return {
    width: ROOM_W,
    depth: ROOM_D,
    height: ROOM_H,
    placements,
    spawn: [0, EYE_HEIGHT, ROOM_D / 2 - 1.6],
    doorWidth: 1.7,
    doorHeight: 2.7,
  }
}

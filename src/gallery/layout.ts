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
  width: number // x extent
  depth: number // z extent
  height: number
  placements: Placement[]
  spawn: [number, number, number]
  doorWidth: number
  doorHeight: number
}

export const EYE_HEIGHT = 1.7
const HANG_HEIGHT = 1.62
const WALL_MARGIN = 1.9

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

/**
 * Rectangular room; paintings distributed over back, side, and (for large
 * collections) front walls. The front wall holds the entry door.
 */
export function computeRoom(paintings: Painting[]): RoomSpec {
  const n = paintings.length
  // wall assignment order tuned for 4-8 works; round-robin beyond that
  const wallOrder =
    n <= 8
      ? ['back', 'right', 'left', 'back', 'right', 'left', 'back', 'front']
      : Array.from({ length: n }, (_, i) => ['back', 'right', 'left', 'front'][i % 4])

  const byWall: Record<string, Painting[]> = { back: [], right: [], left: [], front: [] }
  paintings.forEach((p, i) => byWall[wallOrder[i % wallOrder.length]].push(p))

  const maxRow = Math.max(byWall.back.length, byWall.front.length + 1)
  const maxSide = Math.max(byWall.left.length, byWall.right.length)
  const width = Math.max(9.5, maxRow * 3.7 + WALL_MARGIN * 2)
  const depth = Math.max(11, maxSide * 3.7 + WALL_MARGIN * 2)
  const height = 4.3

  const placements: Placement[] = []
  const placeRow = (
    list: Painting[],
    axis: 'x' | 'z',
    fixed: number,
    rotationY: number,
    normal: [number, number, number],
    usable: number,
  ) => {
    list.forEach((painting, i) => {
      const t = ((i + 0.5) / list.length - 0.5) * usable
      const { width: w, height: h } = displaySize(painting.aspect)
      const position: [number, number, number] =
        axis === 'x' ? [t, HANG_HEIGHT, fixed] : [fixed, HANG_HEIGHT, t]
      placements.push({ painting, position, rotationY, normal, width: w, height: h })
    })
  }

  placeRow(byWall.back, 'x', -depth / 2 + 0.01, 0, [0, 0, 1], width - WALL_MARGIN * 2)
  placeRow(byWall.right, 'z', width / 2 - 0.01, -Math.PI / 2, [-1, 0, 0], depth - WALL_MARGIN * 2)
  placeRow(byWall.left, 'z', -width / 2 + 0.01, Math.PI / 2, [1, 0, 0], depth - WALL_MARGIN * 2)
  // front wall: keep the middle clear for the door
  byWall.front.forEach((painting, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const t = side * (width / 4 + 0.4)
    const { width: w, height: h } = displaySize(painting.aspect)
    placements.push({
      painting,
      position: [t, HANG_HEIGHT, depth / 2 - 0.01],
      rotationY: Math.PI,
      normal: [0, 0, -1],
      width: w,
      height: h,
    })
  })

  return {
    width,
    depth,
    height,
    placements,
    spawn: [0, EYE_HEIGHT, depth / 2 - 1.6],
    doorWidth: 1.7,
    doorHeight: 2.7,
  }
}

import type { BrandTile } from "@modules/brands/data/brands"

/** Upper bound for tile size (w-14 = 3.5rem) */
const TILE_PX = 58
/** Minimum gap between tile edges */
const MIN_GAP_PX = 16

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rand01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 10000
  return x - Math.floor(x)
}

/** Angles near this point (screen “up” / toward the headline) stay clearer for text */
const EXCLUDED_APEX = -Math.PI / 2
/** Wider wedge so fewer tiles drift toward the copy above the ring */
const EXCLUDED_HALF_WIDTH = 1.02

function angleInExcludedTop(angle: number): boolean {
  let d = angle - EXCLUDED_APEX
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return Math.abs(d) < EXCLUDED_HALF_WIDTH
}

function nudgeAngleOutOfExclusion(angle: number): number {
  let d = angle - EXCLUDED_APEX
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  if (Math.abs(d) >= EXCLUDED_HALF_WIDTH) {
    return angle
  }
  // Nearest rim of the cleared “top” sector (keeps tiles off the headline)
  return EXCLUDED_APEX + (d >= 0 ? EXCLUDED_HALF_WIDTH + 0.06 : -EXCLUDED_HALF_WIDTH - 0.06)
}

/**
 * Irregular, deterministic positions on an annulus: random-looking spacing, no overlaps,
 * inner hole keeps tiles off the headline; relaxation pushes tiles apart.
 */
export function computeTilePositions(
  tiles: BrandTile[],
  ringEl: HTMLElement
): { x: number; y: number }[] {
  const w = ringEl.offsetWidth
  const h = ringEl.offsetHeight
  const dim = Math.min(w, h)
  const minCenterDist = TILE_PX + MIN_GAP_PX

  /** Orbit further from center so tiles sit toward the outer edge of the ring */
  const rMin = Math.max(dim * 0.34, 128)
  const rMax = Math.max(dim * 0.54, rMin + 88)

  const n = tiles.length
  const positions: { x: number; y: number }[] = []

  for (let i = 0; i < n; i++) {
    const seed = hash(tiles[i].id)
    const seed2 = hash(tiles[i].id + "r")
    const baseAngle = (i / n) * Math.PI * 2 + (rand01(seed) - 0.5) * 0.38
    let angle = nudgeAngleOutOfExclusion(baseAngle + (rand01(seed2) - 0.5) * 0.26)

    const rJitter = (rand01(seed >>> 1) - 0.5) * 0.14 * (rMax - rMin)
    let r = rMin + rand01(seed >>> 2) * (rMax - rMin) + rJitter
    r = Math.min(rMax, Math.max(rMin, r))

    angle += (rand01(seed >>> 4) - 0.5) * 0.18

    let x = Math.cos(angle) * r
    let y = Math.sin(angle) * r

    if (angleInExcludedTop(Math.atan2(y, x))) {
      const a2 = nudgeAngleOutOfExclusion(Math.atan2(y, x))
      x = Math.cos(a2) * r
      y = Math.sin(a2) * r
    }

    positions.push({ x, y })
  }

  for (let iter = 0; iter < 28; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j].x - positions[i].x
        const dy = positions[j].y - positions[i].y
        const d = Math.hypot(dx, dy) || 1
        if (d < minCenterDist) {
          const push = (minCenterDist - d) * 0.52 + 0.35
          const ux = dx / d
          const uy = dy / d
          positions[i].x -= ux * push
          positions[i].y -= uy * push
          positions[j].x += ux * push
          positions[j].y += uy * push
        }
      }
    }

    for (let i = 0; i < n; i++) {
      let { x, y } = positions[i]
      let dist = Math.hypot(x, y)
      if (dist < rMin) {
        const s = rMin / dist
        x *= s
        y *= s
        dist = rMin
      }
      if (dist > rMax) {
        const s = rMax / dist
        x *= s
        y *= s
        dist = rMax
      }
      let a = Math.atan2(y, x)
      if (angleInExcludedTop(a)) {
        a = nudgeAngleOutOfExclusion(a)
        x = Math.cos(a) * dist
        y = Math.sin(a) * dist
      }
      positions[i] = { x, y }
    }
  }

  /** Keep tiles in the lower part of the ring (positive screen-y) so they don’t sit under the headline */
  const minY = Math.max(32, dim * 0.07)
  for (let i = 0; i < n; i++) {
    let { x, y } = positions[i]
    if (y < minY) {
      y = minY
      let dist = Math.hypot(x, y)
      if (dist < rMin) {
        const s = rMin / dist
        x *= s
        y *= s
      } else if (dist > rMax) {
        const s = rMax / dist
        x *= s
        y *= s
      }
      positions[i] = { x, y }
    }
  }

  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j].x - positions[i].x
        const dy = positions[j].y - positions[i].y
        const d = Math.hypot(dx, dy) || 1
        if (d < minCenterDist) {
          const push = (minCenterDist - d) * 0.5 + 0.25
          const ux = dx / d
          const uy = dy / d
          positions[i].x -= ux * push
          positions[i].y -= uy * push
          positions[j].x += ux * push
          positions[j].y += uy * push
        }
      }
    }
    for (let i = 0; i < n; i++) {
      let { x, y } = positions[i]
      let dist = Math.hypot(x, y)
      if (dist < rMin) {
        const s = rMin / dist
        x *= s
        y *= s
        dist = rMin
      }
      if (dist > rMax) {
        const s = rMax / dist
        x *= s
        y *= s
        dist = rMax
      }
      if (y < minY) {
        y = minY
        dist = Math.hypot(x, y)
        if (dist < rMin) {
          const s = rMin / dist
          x *= s
          y *= s
        } else if (dist > rMax) {
          const s = rMax / dist
          x *= s
          y *= s
        }
      }
      positions[i] = { x, y }
    }
  }

  return positions
}

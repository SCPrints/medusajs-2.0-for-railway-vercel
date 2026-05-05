/**
 * 9-stop spectrum gradient applied to particle wordmarks across the site
 * (SC Prints home/particle-flow, DMC page, Tetris overlay). Each particle's
 * colour is fixed by its position projected onto a 78° axis (CSS convention:
 * 0° = up, increasing clockwise — so 78° is mostly horizontal).
 *
 * Single source of truth — change here and everywhere inherits.
 */
export const WORDMARK_GRADIENT = {
  angleDeg: 78,
  stops: [
    "#ff2e63",
    "#ff6b35",
    "#ffc145",
    "#c1ff45",
    "#3dcfc2",
    "#45a4ff",
    "#6c5cff",
    "#b556ff",
    "#ff56e0",
  ],
}

/** Parse a CSS hex colour ("#rrggbb" or "#rgb") into an RGB tuple. White on parse failure. */
export function parseHexColor(s: string): [number, number, number] {
  const v = s.trim()
  if (v.startsWith("#")) {
    const hex = v.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16)
      const g = parseInt(hex[1]! + hex[1]!, 16)
      const b = parseInt(hex[2]! + hex[2]!, 16)
      return [r, g, b]
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return [r, g, b]
    }
  }
  return [255, 255, 255]
}

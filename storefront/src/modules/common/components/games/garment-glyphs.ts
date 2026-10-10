/**
 * Garment silhouettes for the 404-page games, drawn with Canvas 2D paths.
 *
 * Every glyph is authored in a unit box (x, y ∈ -1..1, y down, centred at
 * 0,0) and scaled to the requested w × h by `drawGarment`. Shared by Space
 * Invaders (aliens / player / UFO / lives) and Tetris (block tiles) so both
 * games speak the same visual language as the rest of the shop.
 */

export type GarmentKind =
  | "tee"
  | "hoodie"
  | "polo"
  | "singlet"
  | "cap"
  | "beanie"
  | "tote"

export const GARMENT_KINDS: readonly GarmentKind[] = [
  "tee",
  "hoodie",
  "polo",
  "singlet",
  "cap",
  "beanie",
  "tote",
]

/** Brand palette (globals.css + wordmark gradient). */
export const NAVY = "#1a1a2e"
export const NAVY_RGB: readonly [number, number, number] = [26, 26, 46]

/** Trace the silhouette as the current path. Caller fills / strokes. */
function traceGarment(ctx: CanvasRenderingContext2D, kind: GarmentKind): void {
  ctx.beginPath()
  switch (kind) {
    case "tee":
      ctx.moveTo(-0.32, -0.9)
      ctx.lineTo(-0.95, -0.6)
      ctx.lineTo(-0.72, -0.12)
      ctx.lineTo(-0.52, -0.22)
      ctx.lineTo(-0.52, 0.9)
      ctx.lineTo(0.52, 0.9)
      ctx.lineTo(0.52, -0.22)
      ctx.lineTo(0.72, -0.12)
      ctx.lineTo(0.95, -0.6)
      ctx.lineTo(0.32, -0.9)
      ctx.quadraticCurveTo(0, -0.55, -0.32, -0.9)
      break
    case "polo":
      ctx.moveTo(-0.3, -0.9)
      ctx.lineTo(-0.95, -0.6)
      ctx.lineTo(-0.72, -0.12)
      ctx.lineTo(-0.52, -0.22)
      ctx.lineTo(-0.52, 0.9)
      ctx.lineTo(0.52, 0.9)
      ctx.lineTo(0.52, -0.22)
      ctx.lineTo(0.72, -0.12)
      ctx.lineTo(0.95, -0.6)
      ctx.lineTo(0.3, -0.9)
      ctx.lineTo(0, -0.35)
      break
    case "hoodie":
      ctx.moveTo(-0.42, -0.62)
      ctx.lineTo(-0.95, -0.4)
      ctx.lineTo(-0.95, 0.5)
      ctx.lineTo(-0.6, 0.55)
      ctx.lineTo(-0.6, 0.92)
      ctx.lineTo(0.6, 0.92)
      ctx.lineTo(0.6, 0.55)
      ctx.lineTo(0.95, 0.5)
      ctx.lineTo(0.95, -0.4)
      ctx.lineTo(0.42, -0.62)
      ctx.quadraticCurveTo(0.42, -1.05, 0, -1.0)
      ctx.quadraticCurveTo(-0.42, -1.05, -0.42, -0.62)
      break
    case "singlet":
      ctx.moveTo(-0.62, -0.95)
      ctx.lineTo(-0.36, -0.95)
      ctx.quadraticCurveTo(-0.34, -0.3, 0, -0.28)
      ctx.quadraticCurveTo(0.34, -0.3, 0.36, -0.95)
      ctx.lineTo(0.62, -0.95)
      ctx.quadraticCurveTo(0.62, -0.1, 0.52, 0.1)
      ctx.lineTo(0.52, 0.92)
      ctx.lineTo(-0.52, 0.92)
      ctx.lineTo(-0.52, 0.1)
      ctx.quadraticCurveTo(-0.62, -0.1, -0.62, -0.95)
      break
    case "cap":
      /** Crown + brim to the right. */
      ctx.moveTo(-0.7, 0.2)
      ctx.quadraticCurveTo(-0.7, -0.95, 0.05, -0.95)
      ctx.quadraticCurveTo(0.7, -0.95, 0.7, 0.2)
      ctx.lineTo(0.95, 0.2)
      ctx.quadraticCurveTo(1.0, 0.5, 0.75, 0.55)
      ctx.lineTo(-0.6, 0.55)
      ctx.quadraticCurveTo(-0.8, 0.55, -0.7, 0.2)
      break
    case "beanie":
      /** Pom-pom, crown, folded band. */
      ctx.moveTo(-0.72, 0.25)
      ctx.quadraticCurveTo(-0.72, -0.8, 0, -0.8)
      ctx.quadraticCurveTo(0.72, -0.8, 0.72, 0.25)
      ctx.lineTo(0.82, 0.25)
      ctx.lineTo(0.82, 0.85)
      ctx.lineTo(-0.82, 0.85)
      ctx.lineTo(-0.82, 0.25)
      ctx.closePath()
      ctx.moveTo(0.22, -0.78)
      ctx.arc(0, -0.78, 0.22, 0, Math.PI * 2)
      break
    case "tote":
      /** Bag body; handles are stroked separately in drawGarment. */
      ctx.moveTo(-0.7, -0.15)
      ctx.lineTo(0.7, -0.15)
      ctx.lineTo(0.7, 0.95)
      ctx.lineTo(-0.7, 0.95)
      break
  }
  ctx.closePath()
}

/**
 * Draw a garment silhouette centred at (cx, cy), fitted to w × h.
 * `fill` is the garment colour; `detail` (optional) is the colour used for
 * secondary marks (polo placket, hoodie hood opening, tote handles).
 */
export function drawGarment(
  ctx: CanvasRenderingContext2D,
  kind: GarmentKind,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string,
  detail?: string
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(w / 2, h / 2)
  ctx.fillStyle = fill
  traceGarment(ctx, kind)
  ctx.fill()
  if (kind === "tote") {
    ctx.strokeStyle = fill
    ctx.lineWidth = 0.16
    ctx.beginPath()
    ctx.moveTo(-0.4, -0.15)
    ctx.quadraticCurveTo(-0.4, -0.95, 0, -0.95)
    ctx.quadraticCurveTo(0.4, -0.95, 0.4, -0.15)
    ctx.stroke()
  }
  if (detail) {
    ctx.fillStyle = detail
    ctx.beginPath()
    if (kind === "hoodie") {
      ctx.ellipse(0, -0.5, 0.26, 0.2, 0, 0, Math.PI * 2)
    } else if (kind === "polo") {
      ctx.rect(-0.05, -0.35, 0.1, 0.45)
    } else if (kind === "cap") {
      ctx.rect(-0.04, -0.9, 0.08, 0.7)
    } else if (kind === "beanie") {
      ctx.rect(-0.82, 0.25, 1.64, 0.08)
    }
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Tetris block: a rounded, brand-coloured tile with a navy garment printed
 * on it — reads like a swatch card from the product grid instead of a glowing
 * blob. `size` is the cell edge in canvas px.
 */
export function drawGarmentTile(
  ctx: CanvasRenderingContext2D,
  kind: GarmentKind,
  cx: number,
  cy: number,
  size: number,
  rgb: readonly [number, number, number],
  scale = 1
): void {
  const s = size * 0.92 * scale
  const r = Math.max(2, s * 0.18)
  const x = cx - s / 2
  const y = cy - s / 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, s, s, r)
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
  ctx.fill()
  /** Soft top sheen + bottom shade so tiles have a little depth. */
  const sheen = ctx.createLinearGradient(0, y, 0, y + s)
  sheen.addColorStop(0, "rgba(255,255,255,0.28)")
  sheen.addColorStop(0.5, "rgba(255,255,255,0)")
  sheen.addColorStop(1, "rgba(0,0,0,0.18)")
  ctx.fillStyle = sheen
  ctx.fill()
  drawGarment(ctx, kind, cx, cy + s * 0.02, s * 0.62, s * 0.62, NAVY)
  ctx.restore()
}

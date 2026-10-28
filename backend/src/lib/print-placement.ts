/**
 * Where the artwork sits on each side, in millimetres, from a saved
 * customizer design, on the shared canvas scale (lib/print-geometry.ts, the
 * mirror of the storefront's): 38 cm = 68% of the canvas width, 48 cm = 72%
 * of its height — the same scale the customizer's `approxCm` sizes use.
 *
 * Reference point: the top of the full print zone (where an oversize print
 * starts, 13% down the canvas) and the garment's centre line. It is NOT
 * measured from the collar: the canvas has no collar landmark.
 *
 * ponytail: rotation is ignored (box of the unrotated artwork). Fine for the
 * usual straight prints; a rotated logo reads a little small.
 */

import { MOCKUP_SCALE_ORIGIN, mmPerCanvasPx, savedCanvasSize } from "./print-geometry"

export type SidePlacement = {
  side: string
  widthMm: number
  heightMm: number
  /** Top edge of the artwork below the top of the print zone. */
  fromTopMm: number
  /** Artwork centre relative to the garment centre line; negative = left. */
  offsetXMm: number
}

type Box = { left: number; top: number; right: number; bottom: number }

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

function objectBox(o: Record<string, unknown>): Box | null {
  const left = num(o.left)
  const top = num(o.top)
  const width = num(o.width)
  const height = num(o.height)
  if (left === null || top === null || width === null || height === null) return null
  const w = Math.abs(width * (num(o.scaleX) ?? 1))
  const h = Math.abs(height * (num(o.scaleY) ?? 1))
  // Fabric 6+ defaults to a centre origin; older saves may say "left"/"top".
  const originX = o.originX ?? "center"
  const originY = o.originY ?? "center"
  const x0 = originX === "center" ? left - w / 2 : originX === "right" ? left - w : left
  const y0 = originY === "center" ? top - h / 2 : originY === "bottom" ? top - h : top
  return { left: x0, top: y0, right: x0 + w, bottom: y0 + h }
}

export function computeSidePlacements(design: unknown): SidePlacement[] {
  const d = (design ?? {}) as {
    canvas?: { width?: unknown; height?: unknown }
    printArea?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown }
    sideLayouts?: { side?: unknown; objects?: unknown }[]
  }
  // Scale from the authoring canvas, not scpPrintSizeId: with different sizes
  // per side the stored printArea belongs to another size (see savedCanvasSize).
  const canvas = savedCanvasSize(d)
  if (!canvas || !Array.isArray(d.sideLayouts)) return []

  const { x: mmPerPxX, y: mmPerPxY } = mmPerCanvasPx(canvas)
  const zoneTop = canvas.height * MOCKUP_SCALE_ORIGIN.y
  const centreX = canvas.width / 2

  const out: SidePlacement[] = []
  for (const layout of d.sideLayouts) {
    const objects = Array.isArray(layout?.objects)
      ? (layout.objects as Record<string, unknown>[])
      : []
    // Customer artwork carries a customizerId; prefer those if present.
    const tagged = objects.filter((o) => o && o.customizerId)
    const boxes = (tagged.length ? tagged : objects)
      .map((o) => (o && typeof o === "object" ? objectBox(o) : null))
      .filter((b): b is Box => b !== null)
    if (!boxes.length || typeof layout.side !== "string") continue
    const box = boxes.reduce((a, b) => ({
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    }))
    out.push({
      side: layout.side,
      widthMm: Math.round((box.right - box.left) * mmPerPxX),
      heightMm: Math.round((box.bottom - box.top) * mmPerPxY),
      fromTopMm: Math.round((box.top - zoneTop) * mmPerPxY),
      offsetXMm: Math.round(((box.left + box.right) / 2 - centreX) * mmPerPxX),
    })
  }
  return out
}

const across = (p: SidePlacement): string =>
  Math.abs(p.offsetXMm) < 5
    ? "centred"
    : // As you look at the garment: right of centre = the wearer's left chest.
      `${Math.abs(p.offsetXMm)} mm ${p.offsetXMm < 0 ? "left" : "right"} of centre (as viewed)`

/** Staff view: "92 × 110 mm · 35 mm below top of print zone · centred" */
export function formatPlacement(p: SidePlacement): string {
  // Sleeves and tags have no meaningful print-zone top.
  const down =
    p.side === "front" || p.side === "back"
      ? ` · ${Math.max(0, p.fromTopMm)} mm below top of print zone`
      : ""
  return `${p.widthMm} × ${p.heightMm} mm${down} · ${across(p)}`
}

/** Customer proof: "92 × 110 mm · centred" (no internal print-zone jargon). */
export function formatPlacementShort(p: SidePlacement): string {
  return `${p.widthMm} × ${p.heightMm} mm · ${across(p)}`
}

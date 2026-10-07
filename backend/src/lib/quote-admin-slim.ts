/**
 * Slim a quote for ADMIN wire transfer. Studio design lines carry the full
 * CustomizerMetadata (Fabric canvas JSON — multi-MB for vector artwork), and
 * the admin Kanban both lists every quote and re-polls the open quote every
 * 2s while a Studio popup is open. Shipping the raw designs made those
 * responses tens of MB and the page minutes-slow.
 *
 * The admin page never reads the design payload itself — it only needs
 * truthiness (the "Studio design" badge + Edit-in-Studio button key off
 * group_id) and the rendered mockups. So each design is replaced with the
 * literal `true`, and the per-side mockup URLs are lifted out of
 * `design.artifacts` into a small derived `mockup_urls` array.
 *
 * Round-trip safety: the admin save posts rows back with
 * `customizerDesign: true` — the [id] update route restores the stored design
 * for any incoming line whose design is not an object (see quotes/[id]
 * route). `mockup_urls` is derived, never persisted; zod strips it on save.
 *
 * STORE routes (accept, design-items rehydrate) are untouched — they need the
 * real payload.
 */

type AnyLine = Record<string, any>

export function slimQuoteLineForAdmin(li: AnyLine): AnyLine {
  const design = li?.customizerDesign
  if (!design || typeof design !== "object") return li
  const artifacts = Array.isArray(design.artifacts) ? design.artifacts : []
  const mockup_urls = artifacts
    .filter((a: any) => typeof a?.mockupUrl === "string" && a.mockupUrl)
    .map((a: any) => ({ side: a.side ?? null, url: a.mockupUrl as string }))
  // Also derived (never persisted): the customer's uploaded source files and
  // per-side print files (artwork download buttons), plus a compact list of
  // decoration positions so the Job pricer can start from the customer's design.
  const print_urls = artifacts
    .filter((a: any) => typeof a?.printUrl === "string" && a.printUrl)
    .map((a: any) => ({ side: a.side ?? null, url: a.printUrl as string }))
  const original_files = (
    Array.isArray(design.customerOriginalFiles) ? design.customerOriginalFiles : []
  )
    .filter((f: any) => typeof f?.url === "string" && f.url)
    .map((f: any) => ({
      url: f.url as string,
      fileName: typeof f.fileName === "string" ? f.fileName : null,
      sides: Array.isArray(f.sides) ? f.sides.map(String) : null,
    }))
  return {
    ...li,
    customizerDesign: true,
    mockup_urls,
    print_urls,
    original_files,
    design_positions: designPositions(design),
  }
}

export type DesignPosition = {
  side: string
  method: "print" | "screen" | "embroidery"
  sizeId?: string
  colours?: number
  stitches?: number
}

/** One entry per decoration: each embroidery side, each print transfer (a side can carry several). */
export function designPositions(design: any): DesignPosition[] {
  const methods = (design?.sideDecorationMethods ?? {}) as Record<string, string>
  const emb = (design?.sideEmbroideryConfigs ?? {}) as Record<string, any>
  const screen = (design?.sideScreenConfigs ?? {}) as Record<string, any>
  const out: DesignPosition[] = []
  for (const [side, cfg] of Object.entries(emb)) {
    if (methods[side] && methods[side] !== "embroidery") continue
    out.push({ side, method: "embroidery", stitches: Number(cfg?.stitchCount) || undefined })
  }
  const screenSides = new Set<string>()
  for (const p of Array.isArray(design?.prints) ? design.prints : []) {
    const side = typeof p?.side === "string" ? p.side : "front"
    const method = methods[side] ?? "print"
    if (method === "embroidery") continue
    if (method === "screen") {
      // One screen run per side, whatever the object count.
      if (screenSides.has(side)) continue
      screenSides.add(side)
      out.push({ side, method: "screen", colours: Number(screen[side]?.colours) || 1 })
      continue
    }
    const cm = p?.approxCm
    out.push({
      side,
      method: "print",
      sizeId: fitPrintSize(Number(cm?.width), Number(cm?.height)) ?? (typeof p?.sizeId === "string" ? p.sizeId : undefined),
    })
  }
  return out
}

// Transfer sheet sizes (cm) — SCP_PRINT_SIZE_OPTIONS dimensions. The Studio's
// auto-snapped `sizeId` can overshoot (seen: a 19×7.7 cm print snapped to
// Oversize), so staff quotes size by the artwork's physical extent instead.
const PRINT_SHEETS: Array<[string, number, number]> = [
  ["up_to_a6", 10, 15],
  ["up_to_a4", 21, 30],
  ["up_to_a3", 29, 42],
  ["oversize", 38, 48],
]

/** Smallest transfer the artwork fits on, either orientation; null when the size is unknown. */
export function fitPrintSize(widthCm: number, heightCm: number): string | null {
  if (!(widthCm > 0) || !(heightCm > 0)) return null
  const [a, b] = [Math.min(widthCm, heightCm), Math.max(widthCm, heightCm)]
  return PRINT_SHEETS.find(([, w, h]) => a <= w && b <= h)?.[0] ?? "oversize"
}

export function slimQuoteForAdmin<T extends AnyLine>(quote: T): T {
  const items = quote?.line_items?.items
  if (!Array.isArray(items)) return quote
  return {
    ...quote,
    line_items: { ...quote.line_items, items: items.map(slimQuoteLineForAdmin) },
  }
}

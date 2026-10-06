/**
 * Customer-facing view of a Job-pricer job — the snapshot the pricer saved on
 * the quote (`metadata.job_pricer.snapshot`) with every internal number
 * (cost, margin, tier, override flag) stripped. Rendered on the accept page so
 * the customer sees how the total was built (garments × positions × setups)
 * instead of a flat list of colour/size SKUs.
 *
 * Returns null when the snapshot no longer matches the pricer's own lines —
 * staff edited a `jp_` line by hand after pricing — so the page falls back to
 * the line items rather than showing a stale breakdown.
 */

export type JobBreakdownForCustomer = {
  summary: string | null
  garment_quantity: number
  designs: Array<{ label: string; image_url: string | null }>
  groups: Array<{
    title: string
    thumbnail: string | null
    quantity: number
    unit_min: number
    unit_max: number
    total: number
    positions: string[]
    rows: Array<{ label: string; quantity: number; unit: number; total: number }>
  }>
  extras: Array<{ label: string; quantity: number; unit: number; total: number; waived: boolean }>
  totals: { subtotal: number; discount: number; total: number }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)

export function buildQuoteJobBreakdown(quote: any): JobBreakdownForCustomer | null {
  const snap = quote?.metadata?.job_pricer?.snapshot
  if (!snap || typeof snap !== "object") return null
  const groups = Array.isArray(snap.groups) ? snap.groups : []
  const extras = Array.isArray(snap.extras) ? snap.extras : []
  if (!groups.length && !extras.length) return null

  const totals = snap.totals ?? {}
  const total = num(totals.sellIncMajor)

  // Drift check: the pricer's lines (ids `jp_…`) must still add up to the
  // snapshot total. Pro-rata discount rounding is ≤ half a cent per line.
  const lines: Array<Record<string, any>> = Array.isArray(quote?.line_items?.items) ? quote.line_items.items : []
  const pricerLines = lines.filter((li) => String(li?.id ?? "").startsWith("jp_"))
  if (!pricerLines.length) return null
  const lineSum = pricerLines.reduce((s, li) => s + num(li.quantity) * num(li.unit_price), 0)
  if (Math.abs(lineSum - total) > Math.max(1, pricerLines.length * 0.01)) return null

  return {
    summary: typeof snap.summary === "string" && snap.summary ? snap.summary : null,
    garment_quantity: num(snap.garmentQuantity),
    designs: (Array.isArray(snap.designs) ? snap.designs : []).map((d: any) => ({
      label: String(d?.label ?? ""),
      image_url: typeof d?.imageUrl === "string" ? d.imageUrl : null,
    })),
    groups: groups.map((g: any) => ({
      title: String(g?.title ?? "Garment"),
      thumbnail: typeof g?.thumbnail === "string" ? g.thumbnail : null,
      quantity: num(g?.quantity),
      unit_min: num(g?.unitSellMin),
      unit_max: num(g?.unitSellMax),
      total: num(g?.sellTotalMajor),
      positions: Array.isArray(g?.positions) ? g.positions.map(String) : [],
      rows: (Array.isArray(g?.rows) ? g.rows : []).map((r: any) => ({
        label: String(r?.label ?? ""),
        quantity: num(r?.quantity),
        unit: num(r?.unitSellMajor),
        total: num(r?.sellTotalMajor),
      })),
    })),
    extras: extras.map((x: any) => ({
      label: String(x?.label ?? ""),
      quantity: num(x?.quantity),
      unit: num(x?.unitSellMajor),
      total: num(x?.sellTotalMajor),
      waived: x?.waived === true,
    })),
    totals: { subtotal: num(totals.subtotalIncMajor) || total, discount: num(totals.discountMajor), total },
  }
}

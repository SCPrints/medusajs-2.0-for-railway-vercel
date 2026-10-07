/**
 * Job pricer save helper (pure, unit-tested): the pricer TAKES OVER the
 * customer's own Studio-design lines (non-`jp_` lines carrying a design) for
 * the garments it prices. Each pricer line inherits the design of the Studio
 * line with the same variant, else of any Studio line on the same product,
 * and those Studio lines are dropped — otherwise the customer is quoted every
 * garment twice (Q-3HGYD4KWZ4, 2026-10-07). Studio lines for a product the
 * pricer doesn't price are kept and counted so staff are told.
 *
 * The taken-over design travels as `customizerDesign: true` + `design_from`
 * (the Studio line's id) — the quote update route restores the stored design
 * from that id.
 */
export type AbsorbExisting = {
  id?: string
  customizerDesign?: unknown
  product_id?: string | null
  variant_id?: string | null
  print_size_id?: string | null
  thumbnail?: string | null
}

export type AbsorbLine = {
  id: string
  product_id: string | null
  variant_id: string | null
  thumbnail: string | null
  customizerDesign?: true
  design_from?: string
  print_size_id?: string | null
}

export function absorbStudioLines<M extends AbsorbExisting, L extends AbsorbLine>(manual: M[], lines: L[]) {
  const studio = manual.filter((li) => li.customizerDesign && li.id)
  const pricedProducts = new Set(
    lines.filter((l) => l.id.startsWith("jp_r_") && l.product_id).map((l) => l.product_id as string)
  )
  const claimed = new Set<string>()
  const out = lines.map((l) => {
    if (l.customizerDesign || !l.id.startsWith("jp_r_") || !l.product_id) return l
    const src =
      studio.find((s) => !claimed.has(s.id!) && l.variant_id && s.variant_id === l.variant_id) ??
      studio.find((s) => s.product_id === l.product_id)
    if (!src?.id) return l
    claimed.add(src.id)
    return { ...l, customizerDesign: true as const, design_from: src.id, print_size_id: src.print_size_id ?? null, thumbnail: src.thumbnail ?? l.thumbnail }
  })
  // Every Studio line for a garment the pricer prices is replaced — whether or
  // not its design was needed (the pricer line may already carry one).
  const replaced = studio.filter((s) => s.product_id && pricedProducts.has(s.product_id))
  const replacedIds = new Set(replaced.map((s) => s.id))
  const kept = manual.filter((li) => !replacedIds.has(li.id))
  return {
    lines: out,
    manual: kept,
    absorbed: replaced.length,
    unmatched: kept.filter((li) => li.customizerDesign).length,
  }
}

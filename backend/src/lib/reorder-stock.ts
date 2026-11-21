/** Stock check for "Order again" (pure; the route loads the data). */

export type StockVariant = {
  id: string
  title: string
  /** option id → value, e.g. { opt_colour: "Navy", opt_size: "L" } */
  options: Record<string, string>
  /** units in stock; null = not tracked / backorder allowed (always ok) */
  available: number | null
}

export type StockLineInput = {
  line_item_id: string
  title: string
  variant_title: string | null
  variant_id: string | null
  wanted: number
  variant: StockVariant | null
  /** every variant of the same product */
  siblings: StockVariant[]
  sizeOptionId: string | null
  /** the product's own size order (option value order) */
  sizeOrder: string[]
}

export type StockLineResult = {
  line_item_id: string
  title: string
  variant_title: string | null
  wanted: number
  available: number | null
  ok: boolean
  suggestion?: { variant_id: string; title: string; available: number | null }
}

export function checkReorderStock(lines: StockLineInput[]): StockLineResult[] {
  return lines.map((l) => {
    const available = l.variant ? l.variant.available : null
    const ok = available === null || available >= l.wanted
    const out: StockLineResult = {
      line_item_id: l.line_item_id,
      title: l.title,
      variant_title: l.variant_title,
      wanted: l.wanted,
      available,
      ok,
    }
    if (ok || !l.variant || !l.sizeOptionId) return out
    const sizeId = l.sizeOptionId
    const idx = (v: StockVariant) => l.sizeOrder.indexOf(v.options[sizeId])
    const here = idx(l.variant)
    if (here < 0) return out
    // same product and colour (every option except size), nearest size with enough stock
    const same = (v: StockVariant) =>
      Object.keys(l.variant!.options).every((k) => k === sizeId || v.options[k] === l.variant!.options[k])
    let best: StockVariant | null = null
    let bestDist = Infinity
    for (const v of l.siblings) {
      if (v.id === l.variant.id || !same(v)) continue
      const i = idx(v)
      if (i < 0 || (v.available !== null && v.available < l.wanted)) continue
      const d = Math.abs(i - here)
      // tie → the larger size
      if (d < bestDist || (d === bestDist && best && i > idx(best))) {
        best = v
        bestDist = d
      }
    }
    if (best) out.suggestion = { variant_id: best.id, title: best.title, available: best.available }
    return out
  })
}

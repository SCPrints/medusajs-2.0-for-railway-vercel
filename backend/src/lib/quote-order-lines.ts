/**
 * Which quote lines are not on the quote's order yet — lines staff added to
 * the quote after it converted (shipping, an extra fee, another garment).
 *
 * Exact link: since 2026-11-06 every order line made from a quote line carries
 * `metadata.quote_line_id` (convert + "Add to order"), and Enter sizes copies
 * it onto the size lines. Older orders have no link, so their lines are
 * matched one-to-one by group, variant, title, then same price + qty. When in
 * doubt a line counts as on the order: missing an extra is fixable, billing
 * a line twice is not.
 *
 * Pure (no framework imports) so the admin can share the types and it tests
 * without a DB.
 */

export type QuoteLineLike = {
  id?: string | null
  title?: string | null
  quantity?: number | null
  unit_price?: number | null
  variant_id?: string | null
  group_id?: string | null
}

export type OrderItemLike = {
  title?: string | null
  variant_id?: string | null
  quantity?: unknown
  unit_price?: unknown
  metadata?: Record<string, unknown> | null
}

/** Medusa money/quantity arrives as a number, a string, or a BigNumber object. */
export const num = (v: unknown): number => {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return Number(o.numeric ?? o.value ?? NaN)
  }
  return Number(v)
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase()

export function quoteLinesMissingFromOrder<T extends QuoteLineLike>(lines: T[], items: OrderItemLike[]): T[] {
  const linked = new Set(items.map((i) => i.metadata?.quote_line_id).filter((v): v is string => typeof v === "string"))
  const legacy = items.filter((i) => typeof i.metadata?.quote_line_id !== "string")
  const legacyGroups = new Set(legacy.map((i) => i.metadata?.group_id).filter((v): v is string => typeof v === "string"))
  const pool = [...legacy]

  const tests: Array<(l: T, i: OrderItemLike) => boolean> = [
    (l, i) => !!l.variant_id && i.variant_id === l.variant_id,
    (l, i) => !!norm(l.title) && norm(i.title) === norm(l.title),
    (l, i) => !l.variant_id && !i.variant_id && num(i.unit_price) === Number(l.unit_price) && num(i.quantity) === Number(l.quantity),
  ]

  return lines.filter((l) => {
    if (!(Number(l.quantity ?? 0) > 0) || !norm(l.title)) return false
    if (l.id && linked.has(l.id)) return false
    // A design's lines share a group; Enter sizes splits them, so any match counts.
    if (l.group_id && legacyGroups.has(l.group_id)) return false
    for (const test of tests) {
      const at = pool.findIndex((i) => test(l, i))
      if (at >= 0) {
        pool.splice(at, 1)
        return false
      }
    }
    return true
  })
}

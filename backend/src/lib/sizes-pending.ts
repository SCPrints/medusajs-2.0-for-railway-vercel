/**
 * Sizes pending — pure, admin-safe (no framework imports). A garment quoted
 * before the customer knows sizes lands on the order as a variant-less line
 * carrying `metadata.sizes_pending`: no SKU, so it holds no stock and can't be
 * sent to a supplier, until staff enter the sizes and it splits into real lines.
 */
export const SERVICE_LINE_HANDLE = "custom-service-line"

export type SizesPending = {
  product_id: string | null
  product_handle: string | null
  colour: string | null
}

type QuoteLineShape = {
  id?: unknown
  variant_id?: unknown
  product_id?: unknown
  product_handle?: unknown
  colour?: unknown
  sizes_pending?: unknown
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

/** Does this quote line name a garment whose size isn't chosen yet? */
export function quoteLineNeedsSizes(li: QuoteLineShape): boolean {
  if (li.product_handle === SERVICE_LINE_HANDLE) return false
  if (li.sizes_pending === true) return true
  // A pricer "Any" cell. Older quotes saved these with the first size's variant.
  if (typeof li.id === "string" && li.id.endsWith(":any")) return true
  return !li.variant_id && Boolean(li.product_id || li.product_handle)
}

/** The colour from a pricer title: "Tee — BLACK (any size)", "Crew — Tee, BLACK (any size)". */
export const colourFromAnySizeTitle = (title: unknown): string | null =>
  typeof title === "string" ? (title.match(/—\s*(?:[^—]*,\s*)?([^—,]+?) \(any size\)\s*$/)?.[1] ?? null) : null

export function sizesPendingFromQuoteLine(li: QuoteLineShape & { title?: unknown }): SizesPending {
  return {
    product_id: str(li.product_id),
    product_handle: str(li.product_handle),
    colour: str(li.colour) ?? colourFromAnySizeTitle(li.title),
  }
}

export type SizeVariant = { id: string; title?: string | null }

const variantParts = (title: string | null | undefined): { colour: string | null; size: string } => {
  const parts = String(title ?? "").split(" / ")
  return parts.length >= 2 ? { colour: parts[0].trim(), size: parts.slice(1).join(" / ").trim() } : { colour: null, size: parts[0].trim() }
}

/** The product's sizes in the line's colour, in the order given. No colour = every variant. */
export function sizeChoices(variants: SizeVariant[], colour: string | null): Array<{ variant_id: string; size: string }> {
  const want = colour?.trim().toLowerCase() ?? null
  return variants
    .map((v) => ({ variant_id: v.id, ...variantParts(v.title) }))
    .filter((v) => !want || v.colour?.toLowerCase() === want)
    .map(({ variant_id, size }) => ({ variant_id, size }))
}

/** A product with one size in this colour (a bag, a cap) needs no sizes: its only variant. */
export function onlyVariantFor(variants: SizeVariant[], colour: string | null): string | null {
  const choices = sizeChoices(variants, colour)
  return choices.length === 1 ? choices[0].variant_id : null
}

export type SizeEntry = { variant_id: string; quantity: number; unit_price: number }

/** Sizes asking for more than the stock on hand (null available = not stock-tracked). */
export function shortSizes(
  wanted: Array<{ variant_id: string; size: string; quantity: number }>,
  available: Map<string, number | null>
): Array<{ size: string; available: number }> {
  return wanted.flatMap((w) => {
    const a = available.get(w.variant_id)
    return a != null && w.quantity > a ? [{ size: w.size, available: Math.max(0, a) }] : []
  })
}

/** Why these sizes can't replace a waiting line, or null when they can. */
export function sizeSplitError(lineQuantity: number, entries: SizeEntry[], allowed: Set<string>): string | null {
  const used = entries.filter((e) => e.quantity > 0)
  if (!used.length) return "Enter a quantity for at least one size."
  if (used.some((e) => !Number.isInteger(e.quantity))) return "Quantities must be whole numbers."
  if (used.some((e) => !allowed.has(e.variant_id))) return "One of the sizes isn't this garment and colour."
  if (new Set(used.map((e) => e.variant_id)).size !== used.length) return "A size is listed twice."
  if (used.some((e) => !Number.isFinite(e.unit_price) || e.unit_price < 0)) return "Every size needs a price."
  const total = used.reduce((n, e) => n + e.quantity, 0)
  if (total !== lineQuantity) return `The sizes add up to ${total}, the line is ${lineQuantity}.`
  return null
}

export function isSizesPendingLine(line: { metadata?: Record<string, unknown> | null }): boolean {
  const p = line.metadata?.sizes_pending
  return typeof p === "object" && p !== null
}

export function sizesPendingUnits(
  lines: Array<{ quantity?: unknown; metadata?: Record<string, unknown> | null }>
): number {
  return lines.reduce((n, l) => (isSizesPendingLine(l) ? n + (Number(l.quantity) || 0) : n), 0)
}

export type NeedsSizesOrder = {
  order_id: string
  display_id: number | null
  customer: string
  lines: Array<{ title: string; quantity: number }>
}

/** A Dropship queue row for an order whose garments from this supplier have no sizes yet. */
export function needsSizesForSupplier(
  order: { id: string; display_id?: number | null; items?: any[] | null },
  handlePrefix: string,
  customer: string
): NeedsSizesOrder | null {
  const lines = (order.items ?? []).filter(
    (li) => isSizesPendingLine(li) && String(li.metadata?.product_handle ?? "").startsWith(handlePrefix)
  )
  if (!lines.length) return null
  return {
    order_id: order.id,
    display_id: order.display_id ?? null,
    customer,
    lines: lines.map((li) => ({ title: String(li.title ?? ""), quantity: Number(li.quantity ?? 0) })),
  }
}

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
  return { ...li, customizerDesign: true, mockup_urls }
}

export function slimQuoteForAdmin<T extends AnyLine>(quote: T): T {
  const items = quote?.line_items?.items
  if (!Array.isArray(items)) return quote
  return {
    ...quote,
    line_items: { ...quote.line_items, items: items.map(slimQuoteLineForAdmin) },
  }
}

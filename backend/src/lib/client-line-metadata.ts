/**
 * Cart-line metadata trust boundary (code review 2026-10, findings 1-4 + 1-5).
 *
 * The recompute, the checkout invariant and the add descriptor key server
 * trust off line metadata: `quote_locked_price` / `decorationDesign` /
 * `price_override` exempt a line from re-pricing and from the invariant, and
 * `customizerDesign.pricing.server` (garment_unit_major, heavy-garment,
 * full-colour card) seeds the recompute. Every one of those was writable by
 * the browser — through the scp routes (the descriptor spread incoming
 * metadata verbatim) and through Medusa's core line-items routes, which
 * accept arbitrary metadata.
 *
 * Two mechanisms, one key list:
 *   - `allowlistClientLineMetadata` — the scp add descriptor keeps only keys a
 *     caller legitimately owns and drops everything else. The list covers the
 *     storefront (customizer, saved-design tags, display fallbacks) AND the
 *     server-side builders that route through the same descriptor (bundle
 *     packs, group orders). A new line-metadata key must be added here or it
 *     is silently dropped on add.
 *   - `stripServerTrustMetadata` — the core `/store/carts/:id/line-items`
 *     routes delete just the trust keys and leave the rest (vectorization /
 *     setup markers, DTF gang-sheet fields) alone.
 *
 * `customizerDesign.pricing.server` is removed by both; the descriptor and
 * the update-design route always write a freshly computed block.
 *
 * Legitimate writers of the trust keys never pass through here:
 * services/quote/convert.ts stamps quote_locked_price on ORDER lines via
 * createOrderWorkflow, and the embroidery-line-items route builds
 * decorationDesign server-side before its own addToCartWorkflow call.
 */

export const SERVER_TRUST_METADATA_KEYS = [
  "quote_locked_price",
  "price_override",
  "decorationDesign",
] as const

export const CLIENT_LINE_METADATA_KEYS = [
  // Customizer / Studio (storefront) + saved-design attribution + display fallbacks
  "customizerDesign",
  // Legacy pre-customizer print lines: `{ printPlacement: { side } }` is the
  // only decorated-location source (scp-dtf-print-pricing.ts) — the golden
  // vector synth_legacy_print_placement_only guards it.
  "printPlacement",
  "product_handle",
  "product_title",
  "print_size_id",
  "printNotes",
  "source_design_id",
  "designId",
  "design_id",
  // Bundle packs — lib/bundle-lines.ts buildBundleLineMetadata
  "bundle_id",
  "bundle_handle",
  "bundle_title",
  "bundle_item_id",
  "bundle_item_label",
  "decoration_type",
  "artwork_url",
  // Group orders — lib/group-order-lines.ts
  "group_order_id",
  "group_order_participants",
] as const

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

/** Returns a copy of `customizerDesign` without `pricing.server`, or the input untouched. */
function withoutServerPricing(design: unknown): unknown {
  if (!isObject(design) || !isObject(design.pricing) || !("server" in design.pricing)) {
    return design
  }
  const { server: _server, ...pricing } = design.pricing
  return { ...design, pricing }
}

/** Core line-items routes: delete the trust keys, keep everything else. Returns a new object. */
export function stripServerTrustMetadata(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (!isObject(metadata)) return undefined
  const out: Record<string, unknown> = { ...metadata }
  for (const key of SERVER_TRUST_METADATA_KEYS) delete out[key]
  if ("customizerDesign" in out) out.customizerDesign = withoutServerPricing(out.customizerDesign)
  return out
}

/** scp add descriptor: keep only owned keys; `pricing.server` is always rebuilt by the caller. */
export function allowlistClientLineMetadata(
  metadata: unknown
): { metadata: Record<string, unknown>; dropped: string[] } {
  if (!isObject(metadata)) return { metadata: {}, dropped: [] }
  const allowed = new Set<string>(CLIENT_LINE_METADATA_KEYS)
  const out: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (allowed.has(key)) out[key] = value
    else dropped.push(key)
  }
  if ("customizerDesign" in out) out.customizerDesign = withoutServerPricing(out.customizerDesign)
  return { metadata: out, dropped }
}

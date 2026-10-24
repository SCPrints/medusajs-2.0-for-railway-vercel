/**
 * Meilisearch product document (listing-engine support).
 *
 * The storefront sorts, filters and paginates listings IN Meili instead of
 * scanning the catalog, so the document carries the facets it filters on plus
 * a sortable price. `src/search/products.ts` re-runs this on every product /
 * variant / price / stock / category / tag / type event, so these fields stay
 * fresh without a job.
 *
 * `min_price_aud` is the cheapest variant's single-unit (qty-1) GUEST price in
 * minor units (cents). It sorts correctly for every customer because the
 * catalog is AUD-only and customer tiers are a uniform multiplier applied to
 * every product — a positive constant preserves ordering. Mirrors the tile
 * headline-price rule in src/lib/listing-summary.ts.
 */

/** Graph paths the document is built from (each costs a JOIN at index time only). */
export const PRODUCT_DOCUMENT_GRAPH_FIELDS = [
  "id", "status", "title", "description", "handle", "thumbnail", "created_at",
  "collection_id", "material", "metadata",
  "categories.id",
  "type.id", "type.value",
  "tags.id", "tags.value",
  "brand.handle", "brand.name",
  "variants.id", "variants.sku", "variants.metadata",
  "variants.inventory_quantity", "variants.manage_inventory", "variants.allow_backorder",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.min_quantity",
  "variants.price_set.prices.rules_count",
]

const toMinorAud = (amount: unknown): number | null => {
  const n = Number(amount)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const variantBaseMinor = (variant: any): number | null => {
  const meta = variant?.metadata || {}
  // 1) importer-written base (qty 1-9 band), dollars — every supplier importer writes this.
  const bp = meta.bulk_pricing
  const tier0 = bp && Array.isArray(bp.tiers) ? bp.tiers[0] : null
  const fromMeta = tier0 ? toMinorAud(tier0.amount) : toMinorAud(meta.base_sale_price)
  if (fromMeta != null) return fromMeta
  // 2) fall back to raw price rows: rules-free (no price-list/group) AUD, lowest min_quantity.
  const prices = variant?.price_set?.prices || []
  let best: { mq: number; minor: number } | null = null
  for (const p of prices) {
    if (!p) continue
    if (String(p.currency_code || "").toLowerCase() !== "aud") continue
    if ((p.rules_count ?? 0) !== 0) continue
    const mq = p.min_quantity == null ? 1 : Number(p.min_quantity)
    const minor = toMinorAud(p.amount)
    if (minor == null) continue
    if (best == null || mq < best.mq) best = { mq, minor }
  }
  return best ? best.minor : null
}

export function toProductSearchDocument(product: any): Record<string, unknown> {
  const variants: any[] = Array.isArray(product.variants) ? product.variants : []

  let minPrice: number | null = null
  for (const v of variants) {
    const b = variantBaseMinor(v)
    if (b == null) continue
    if (minPrice == null || b < minPrice) minPrice = b
  }

  const inStock = variants.some((v) => {
    if (!v) return false
    if (v.manage_inventory === false) return true
    if (v.allow_backorder === true) return true
    const q = v.inventory_quantity
    if (q == null) return true // unknown → don't hide (matches storefront hasStock logic)
    return Number(q) > 0
  })

  const meta = product.metadata || {}
  // Importers write the composition to the native `material` column, not
  // metadata — keep `product.material` last so a metadata override still wins.
  const fabricRaw =
    meta.fabric_type || meta.fabric || meta.material || meta.composition ||
    product.material || null
  const fabric = fabricRaw
    ? String(fabricRaw).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
    : []

  const doc: Record<string, unknown> = {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    thumbnail: product.thumbnail,
    variant_sku: variants.map((v) => v && v.sku).filter(Boolean).join(" "),
    created_at_ts: product.created_at ? new Date(product.created_at).getTime() : 0,
    category_ids: (product.categories || []).map((c: any) => c && c.id).filter(Boolean),
    collection_id: product.collection_id || null,
    type_id: product.type?.id || null,
    tag_ids: (product.tags || []).map((t: any) => t && t.id).filter(Boolean),
    brand_handle: product.brand?.handle || null,
    brand_name: product.brand?.name ? String(product.brand.name).toLowerCase() : null,
    fabric,
    // Raw lowercased composition for full-text search ("polyester", "merino"),
    // separate from the `fabric` filter tokens so "100"/"200" don't match.
    material_text: fabricRaw ? String(fabricRaw).toLowerCase() : null,
    in_stock: inStock,
    // Hidden service products (setup fees etc.) — storefront queries filter
    // `internal_service != true`; they stay published so add-to-cart works.
    internal_service: meta.internal_service === true,
  }
  // Omit when unknown so price-less products sink to the end of a price sort
  // (Meili places docs missing a sortable attribute last).
  if (minPrice != null) doc.min_price_aud = minPrice
  return doc
}

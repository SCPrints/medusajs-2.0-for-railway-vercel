/**
 * Pre-computed listing-card payload for a product. Lives in
 * `product.metadata.listing_summary` and is consumed by the storefront's
 * brand-listing cards. Lets the storefront skip iterating the full variant
 * tree (and the backend skip expanding it) for every brand-page render.
 *
 * STOREFRONT MIRROR: this exact shape is hand-mirrored to
 * `storefront/src/lib/listing-summary.ts`. Keep both files in sync — there's
 * no codegen between the two apps. Bump `version` and feature-flag readers
 * on the storefront if you ever change the contract.
 *
 * Scope (2026-05-27): Aussie Pacific only — the architectural fix for the
 * "AP brand page is clunky" perf thread. The compute helper is brand-agnostic
 * and can be wired into other supplier importers when needed.
 */

const COLOR_OPTION_MATCHER = /(color|colour|shade)/i

export type ListingSummaryColor = {
  /** Raw colour label as stored on `option_value.value` (e.g. "WHITE"). */
  value: string
  /** Front photo URL for this colour (the unwrapped supplier URL; the storefront
   *  passes it through `/_next/image` for optimization). */
  image_url: string
}

export type ListingSummary = {
  version: 1
  /** Unsorted — the storefront applies `sortGarmentColorLabels` for display. */
  colors: ListingSummaryColor[]
  /** Cheapest variant's amount in major units (e.g. 24.09 for $24.09). */
  cheapest_amount: number
  /** "100+" tier amount in major units, or null if no tier covers quantity 100. */
  hundred_plus_amount: number | null
  /** ISO currency code, lower-case (e.g. "aud"). */
  currency_code: string
  /** Stamped when computed — for debugging / staleness alerts. */
  computed_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Input shape — tolerant of import-time payload AND DB-fetched product

type VariantOptionLike = {
  option_id?: string | null
  value?: string | null
}

type BulkPricingTier = {
  min_quantity?: number | string | null
  max_quantity?: number | string | null
  amount?: number | string | null
}

type VariantForSummary = {
  options?: VariantOptionLike[] | null
  prices?: Array<{ amount?: number | null; currency_code?: string | null }> | null
  calculated_price?: {
    calculated_amount?: number | null
    currency_code?: string | null
  } | null
  metadata?: {
    bulk_pricing?: {
      tiers?: BulkPricingTier[] | null
      currency_code?: string | null
    } | null
    garment_images?: { front?: string | null } | null
  } | null
}

type ProductOptionLike = {
  id?: string | null
  title?: string | null
}

export type ProductForSummary = {
  options?: ProductOptionLike[] | null
  variants?: VariantForSummary[] | null
}

// ─────────────────────────────────────────────────────────────────────────────

const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Resolve a variant's "headline" amount in major units. Prefers Medusa's
 * `calculated_price` (most authoritative when context is set), falls back to
 * `prices[0]` (import-time before the price set is materialised), and finally
 * to the first `bulk_pricing` tier (last-ditch safety net).
 */
const getVariantHeadlineAmount = (v: VariantForSummary): number | null => {
  const calc = toFiniteNumber(v?.calculated_price?.calculated_amount)
  if (calc !== null) return calc
  const firstPrice = toFiniteNumber(v?.prices?.[0]?.amount)
  if (firstPrice !== null) return firstPrice
  const firstTier = toFiniteNumber(v?.metadata?.bulk_pricing?.tiers?.[0]?.amount)
  return firstTier
}

const getVariantCurrencyCode = (v: VariantForSummary): string | null => {
  const fromCalc = v?.calculated_price?.currency_code
  if (typeof fromCalc === "string" && fromCalc.trim()) return fromCalc.toLowerCase()
  const fromPrices = v?.prices?.[0]?.currency_code
  if (typeof fromPrices === "string" && fromPrices.trim()) return fromPrices.toLowerCase()
  const fromBulk = v?.metadata?.bulk_pricing?.currency_code
  if (typeof fromBulk === "string" && fromBulk.trim()) return fromBulk.toLowerCase()
  return null
}

/** Find the bulk-pricing tier whose [min, max] range includes the given qty. */
const findTierForQuantity = (
  tiers: BulkPricingTier[] | null | undefined,
  qty: number
): number | null => {
  if (!Array.isArray(tiers)) return null
  for (const t of tiers) {
    const min = toFiniteNumber(t?.min_quantity)
    if (min === null || qty < min) continue
    const max = toFiniteNumber(t?.max_quantity)
    if (max !== null && qty > max) continue
    const amt = toFiniteNumber(t?.amount)
    if (amt !== null) return amt
  }
  return null
}

/**
 * Build the listing-summary blob for a product. Returns null if the product is
 * missing the data we need to render a useful card (no priced variants, no
 * colour option, etc.) — the storefront falls back to variant iteration in
 * that case, so this is a safe-soft return.
 */
export function computeListingSummary(
  product: ProductForSummary
): ListingSummary | null {
  const variants = product?.variants ?? []
  if (variants.length === 0) return null

  // Resolve colour option (if any). Products without a colour option still
  // build a single-card summary so the cheapest price line works.
  const colorOption = (product?.options ?? []).find(
    (o) => typeof o?.title === "string" && COLOR_OPTION_MATCHER.test(o.title)
  )
  const colorOptionId = colorOption?.id ?? null

  // Group variants by colour. Variants without the colour option (or with no
  // value set) all land in `noColor` so we still pick a cheapest fallback.
  const byColor = new Map<string, VariantForSummary[]>()
  const noColor: VariantForSummary[] = []
  for (const v of variants) {
    if (!colorOptionId) {
      noColor.push(v)
      continue
    }
    const opt = (v?.options ?? []).find((ov) => ov?.option_id === colorOptionId)
    const raw = typeof opt?.value === "string" ? opt.value.trim() : ""
    if (!raw) {
      noColor.push(v)
      continue
    }
    const arr = byColor.get(raw) ?? []
    arr.push(v)
    byColor.set(raw, arr)
  }

  // For each colour, pick the cheapest variant (so its image_url is from a
  // priced SKU) and read its garment_images.front. Skip colours where no
  // variant has a front image — those would render as broken swatches.
  const colors: ListingSummaryColor[] = []
  for (const [value, group] of byColor) {
    const sorted = [...group].sort((a, b) => {
      const am = getVariantHeadlineAmount(a) ?? Number.POSITIVE_INFINITY
      const bm = getVariantHeadlineAmount(b) ?? Number.POSITIVE_INFINITY
      return am - bm
    })
    const representative = sorted.find(
      (v) =>
        typeof v?.metadata?.garment_images?.front === "string" &&
        (v.metadata.garment_images.front as string).length > 0
    )
    if (!representative) continue
    colors.push({
      value,
      image_url: representative.metadata!.garment_images!.front as string,
    })
  }

  // Find the cheapest variant across the whole product for the headline price.
  const allCandidates = [...variants]
  allCandidates.sort((a, b) => {
    const am = getVariantHeadlineAmount(a) ?? Number.POSITIVE_INFINITY
    const bm = getVariantHeadlineAmount(b) ?? Number.POSITIVE_INFINITY
    return am - bm
  })
  const cheapest = allCandidates.find(
    (v) => getVariantHeadlineAmount(v) !== null
  )
  if (!cheapest) return null

  const cheapestAmount = getVariantHeadlineAmount(cheapest)
  if (cheapestAmount === null) return null

  const currency = getVariantCurrencyCode(cheapest) ?? "aud"

  // 100+ tier from the cheapest variant's bulk_pricing.
  const hundredPlus = findTierForQuantity(
    cheapest?.metadata?.bulk_pricing?.tiers ?? null,
    100
  )

  // If there's no colour option, still emit a single placeholder so the card
  // has something to render. Suppress instead if there's also no usable image.
  if (colors.length === 0 && noColor.length > 0) {
    const firstFront = noColor.find(
      (v) =>
        typeof v?.metadata?.garment_images?.front === "string" &&
        (v.metadata.garment_images.front as string).length > 0
    )
    if (firstFront?.metadata?.garment_images?.front) {
      colors.push({
        value: "",
        image_url: firstFront.metadata.garment_images.front as string,
      })
    }
  }

  // No colours with images = no useful card; let the storefront fall back to
  // its existing variant-iteration path rather than rendering empty swatches.
  if (colors.length === 0) return null

  return {
    version: 1,
    colors,
    cheapest_amount: cheapestAmount,
    hundred_plus_amount: hundredPlus,
    currency_code: currency,
    computed_at: new Date().toISOString(),
  }
}

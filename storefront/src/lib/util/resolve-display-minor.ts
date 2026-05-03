const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    if (!cleaned) {
      return Number.NaN
    }
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : Number.NaN
  }
  return Number.NaN
}

/** Lowest `min_quantity` tier amount from `variant.metadata.bulk_pricing.tiers`, if any. */
export const getFirstBulkTierMinor = (
  variant: { metadata?: Record<string, unknown> } | undefined
): number | undefined => {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const bulkPricing = metadata.bulk_pricing as { tiers?: Array<Record<string, unknown>> } | undefined
  if (!Array.isArray(bulkPricing?.tiers) || bulkPricing.tiers.length === 0) {
    return undefined
  }

  const parsed = bulkPricing.tiers
    .map((tier) => {
      const minQuantity = toNumber(tier.min_quantity)
      const amount = toNumber(tier.amount)
      if (!Number.isFinite(minQuantity) || !Number.isFinite(amount)) {
        return null
      }
      return { min_quantity: minQuantity, amount }
    })
    .filter((t): t is { min_quantity: number; amount: number } => t !== null)
    .sort((a, b) => a.min_quantity - b.min_quantity)

  const first = parsed[0]
  return first && Number.isFinite(first.amount) ? first.amount : undefined
}

/**
 * When bulk tier and Medusa `calculated_price` disagree by more than this ratio, pick the sane value.
 * (50× was too strict: e.g. bulk 30 vs calculated 1235 ≈ 41× wrongly kept bulk → A$0.30 instead of A$12.35.)
 */
const BULK_VS_CALCULATED_MISMATCH_RATIO = 2

/** Below this minor amount, `calculated_price` is treated as suspicious (e.g. 53 minor vs 5300 bulk / Admin). */
const SUSPICIOUSLY_LOW_CALCULATED_MINOR = 100
/** Bulk above this is plausibly a real garment tier in AUD minor units. */
const PLAUSIBLE_RETAIL_BULK_MINOR = 500

/**
 * Choose a minor-unit amount for display when `bulk_pricing` metadata may disagree with
 * Medusa `calculated_price` (e.g. tiers stored at wrong scale or stale CSV match).
 *
 * When bulk >> calculated we used to always trust Medusa; that breaks when the Store API
 * returns an under-scaled amount (53) while metadata (and Admin) align on retail (5300).
 */
export const resolveHeadlineMinorAmount = (
  bulkTierAmount: number | undefined,
  calculatedMinor: number | undefined
): number => {
  const b = typeof bulkTierAmount === "number" && Number.isFinite(bulkTierAmount) ? bulkTierAmount : null
  const c = typeof calculatedMinor === "number" && Number.isFinite(calculatedMinor) ? calculatedMinor : null

  if (b !== null && b > 0 && c !== null && c > 0) {
    if (c >= b * BULK_VS_CALCULATED_MISMATCH_RATIO) {
      return c
    }
    if (b >= c * BULK_VS_CALCULATED_MISMATCH_RATIO) {
      if (
        c < SUSPICIOUSLY_LOW_CALCULATED_MINOR &&
        b > PLAUSIBLE_RETAIL_BULK_MINOR &&
        b >= c * 10
      ) {
        return b
      }
      return c
    }
    return b
  }

  if (b !== null && b > 0) {
    return b
  }

  return c ?? 0
}

/**
 * Handle prefixes for suppliers whose import pipeline is known to occasionally
 * store retail dollars as raw integers (so 53 means $53, not $0.53).
 *
 * Add a prefix here only after confirming the bug exists for that supplier —
 * applying the hundredfold scale-up to a legitimately cheap item ($0.50 sample,
 * accessory, sticker) would 100× the displayed price. Suspect candidates worth
 * spot-checking next: ramo-, syzmik-, dnc-.
 */
const HUNDREDFOLD_TYPO_HANDLE_PREFIXES = ["as-colour-"] as const

/**
 * When Admin shows ~$53 but Store + `bulk_pricing` both carry **53** minor (100× under-scale),
 * `resolveHeadlineMinorAmount` cannot infer a fix. For **AUD** + a known-affected supplier handle,
 * if the resolver left the value equal to raw Medusa and it looks like "dollars stored as cents",
 * multiply by 100 into a plausible garment band ($5–$6000).
 */
export const finalizeAudAsColourMinorIfHundredfoldTypo = (
  resolvedMinor: number,
  apiCalculatedMinor: number,
  productHandle: string | undefined,
  currencyCode: string | undefined
): number => {
  const cc = String(currencyCode ?? "").toLowerCase()
  if (cc !== "aud") {
    return resolvedMinor
  }

  const h = String(productHandle ?? "").trim().toLowerCase()
  if (!HUNDREDFOLD_TYPO_HANDLE_PREFIXES.some((prefix) => h.startsWith(prefix))) {
    return resolvedMinor
  }

  if (resolvedMinor !== apiCalculatedMinor) {
    return resolvedMinor
  }

  const c = apiCalculatedMinor
  if (!(c >= 5 && c <= 199)) {
    return resolvedMinor
  }

  const scaled = Math.round(c * 100)
  if (scaled < 500 || scaled > 600_000) {
    return resolvedMinor
  }

  return scaled
}

type VariantForDisplayMinor = {
  calculated_price?: { calculated_amount?: number; currency_code?: string }
  metadata?: Record<string, unknown>
  product?: { handle?: string }
}

/** Single entry point: bulk vs Medusa resolve + AS Colour AUD hundredfold when both are wrong. */
export const resolveDisplayMinorForVariant = (variant: VariantForDisplayMinor): number => {
  const c = variant?.calculated_price?.calculated_amount
  if (typeof c !== "number" || !Number.isFinite(c)) {
    return 0
  }

  const bulk = getFirstBulkTierMinor(variant as { metadata?: Record<string, unknown> })
  let resolved = resolveHeadlineMinorAmount(bulk, c)

  const handle =
    (typeof variant.product?.handle === "string" && variant.product.handle) ||
    (typeof variant.metadata?.product_handle === "string"
      ? (variant.metadata.product_handle as string)
      : undefined)

  resolved = finalizeAudAsColourMinorIfHundredfoldTypo(
    resolved,
    c,
    handle,
    variant.calculated_price?.currency_code
  )

  return resolved
}

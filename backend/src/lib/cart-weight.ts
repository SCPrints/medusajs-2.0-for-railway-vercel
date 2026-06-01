import {
  SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
} from "./constants"

type WeightyVariant = {
  weight?: number | string | null
}

type WeightyProduct = {
  weight?: number | string | null
}

type WeightyItem = {
  quantity?: number | null
  variant?: (WeightyVariant & { product?: WeightyProduct | null }) | null
  product?: WeightyProduct | null
  metadata?: Record<string, unknown> | null
}

type WeightyCart = {
  items?: WeightyItem[] | null
  metadata?: Record<string, unknown> | null
}

const coerceWeightGrams = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 0
}

/**
 * Resolve a per-line gram weight, falling back from variant → product → 0.
 * `metadata.weight_grams` is honoured for line items (e.g. customizer DTF
 * gangsheets) where neither the variant nor product weight is meaningful.
 */
export const lineItemWeightGrams = (item: WeightyItem): number => {
  const fromMetadata = item.metadata && coerceWeightGrams((item.metadata as any).weight_grams)
  if (fromMetadata) {
    return fromMetadata
  }
  const variantWeight = coerceWeightGrams(item.variant?.weight)
  if (variantWeight) {
    return variantWeight
  }
  const productWeight = coerceWeightGrams(item.variant?.product?.weight ?? item.product?.weight)
  if (productWeight) {
    return productWeight
  }
  return 0
}

export type CartWeightSummary = {
  /** Σ(item.weight × quantity) without packaging overhead, grams. Includes the default-weight fallback for weightless items. */
  itemsWeightGrams: number
  /** Total weight used to price shipping, grams (items + packaging overhead). */
  totalWeightGrams: number
  /** Configurable packaging overhead, grams. */
  packagingOverheadGrams: number
  /** Number of line items with no resolvable REAL weight (these used the default fallback). */
  itemsMissingWeight: number
  /** The per-unit default applied to weightless items (0 when the fallback is disabled). */
  defaultItemWeightGrams: number
}

/**
 * Compute a cart's shipping weight.
 *
 * `defaultItemWeightGrams` is the per-UNIT fallback for line items that have no
 * real weight (no variant/product weight, no `metadata.weight_grams`). It
 * defaults to `SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS` so weight-based shipping
 * scales with order size even though almost nothing in the catalog has a
 * weight set yet. Pass `0` to opt out (raw real-weight-only behaviour).
 */
export const computeCartWeight = (
  cart: WeightyCart | null | undefined,
  packagingOverheadGrams: number = SHIPPING_PACKAGING_OVERHEAD_GRAMS,
  defaultItemWeightGrams: number = SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS
): CartWeightSummary => {
  const items = Array.isArray(cart?.items) ? cart!.items! : []
  const fallbackPerUnit = defaultItemWeightGrams > 0 ? defaultItemWeightGrams : 0
  let itemsWeightGrams = 0
  let itemsMissingWeight = 0

  for (const item of items) {
    const qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 0
    const realPerLine = lineItemWeightGrams(item)
    // No real weight → fall back to the default per-unit garment weight so the
    // line still contributes mass (and bulk orders price correctly).
    const perLine = realPerLine > 0 ? realPerLine : fallbackPerUnit
    if (realPerLine === 0) {
      itemsMissingWeight++
    }
    itemsWeightGrams += perLine * qty
  }

  const overhead = packagingOverheadGrams > 0 ? packagingOverheadGrams : 0
  return {
    itemsWeightGrams,
    totalWeightGrams: itemsWeightGrams + overhead,
    packagingOverheadGrams: overhead,
    itemsMissingWeight,
    defaultItemWeightGrams: fallbackPerUnit,
  }
}

export const totalWeightGrams = (cart: WeightyCart | null | undefined): number =>
  computeCartWeight(cart).totalWeightGrams

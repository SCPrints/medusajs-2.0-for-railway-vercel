import { SHIPPING_PACKAGING_OVERHEAD_GRAMS } from "./constants"

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
  /** Σ(item.weight × quantity) without packaging overhead, grams. */
  itemsWeightGrams: number
  /** Total weight Medusa will quote ShipStation with, grams. */
  totalWeightGrams: number
  /** Configurable packaging overhead, grams. */
  packagingOverheadGrams: number
  /** Number of line items with no resolvable weight (zero counted in the total). */
  itemsMissingWeight: number
}

export const computeCartWeight = (
  cart: WeightyCart | null | undefined,
  packagingOverheadGrams: number = SHIPPING_PACKAGING_OVERHEAD_GRAMS
): CartWeightSummary => {
  const items = Array.isArray(cart?.items) ? cart!.items! : []
  let itemsWeightGrams = 0
  let itemsMissingWeight = 0

  for (const item of items) {
    const qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 0
    const perLine = lineItemWeightGrams(item)
    if (perLine === 0) {
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
  }
}

export const totalWeightGrams = (cart: WeightyCart | null | undefined): number =>
  computeCartWeight(cart).totalWeightGrams

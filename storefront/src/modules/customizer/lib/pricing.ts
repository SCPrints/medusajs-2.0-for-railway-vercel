import { BulkPricingTier, PricingBreakdown, PricingInput } from "./types"

const SIDE_SURCHARGE_CENTS = 250

const getQuantityDiscountRate = (quantity: number) => {
  if (quantity >= 100) {
    return 0.2
  }

  if (quantity >= 50) {
    return 0.15
  }

  if (quantity >= 20) {
    return 0.1
  }

  if (quantity >= 10) {
    return 0.05
  }

  return 0
}

const normalizeTiers = (tiers?: BulkPricingTier[]) =>
  (tiers ?? [])
    .filter((tier) => Number.isFinite(tier.minQuantity) && Number.isFinite(tier.amountCents))
    .map((tier) => ({
      minQuantity: Math.max(1, Math.floor(tier.minQuantity)),
      maxQuantity:
        typeof tier.maxQuantity === "number" && Number.isFinite(tier.maxQuantity)
          ? Math.max(1, Math.floor(tier.maxQuantity))
          : undefined,
      amountCents: Math.max(0, Math.floor(tier.amountCents)),
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity)

const resolveBulkTierForQuantity = (tiers: BulkPricingTier[], quantity: number) =>
  tiers.find((tier) => {
    if (quantity < tier.minQuantity) {
      return false
    }
    if (typeof tier.maxQuantity === "number" && quantity > tier.maxQuantity) {
      return false
    }
    return true
  }) ?? tiers[tiers.length - 1]

export const formatCurrency = (amountCents: number, currencyCode = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amountCents / 100)

export const calculatePricing = ({
  basePriceCents,
  decoratedSidesCount,
  totalQuantity,
  bulkPricingTiers,
}: PricingInput): PricingBreakdown => {
  const safeQuantity = Math.max(1, Math.floor(totalQuantity || 1))
  const decoratedSides = Math.max(0, Math.floor(decoratedSidesCount || 0))
  const sideSurchargePerUnitCents = decoratedSides * SIDE_SURCHARGE_CENTS
  const normalizedTiers = normalizeTiers(bulkPricingTiers)
  const activeBulkTier = normalizedTiers.length
    ? resolveBulkTierForQuantity(normalizedTiers, safeQuantity)
    : undefined
  const fallbackBaseUnit = Math.max(0, Math.floor(basePriceCents))
  const baseUnit = activeBulkTier?.amountCents ?? fallbackBaseUnit
  const beforeDiscountUnit = baseUnit + sideSurchargePerUnitCents
  const firstTierBase = normalizedTiers[0]?.amountCents ?? baseUnit
  const quantityDiscountRate = normalizedTiers.length
    ? firstTierBase > baseUnit
      ? (firstTierBase - baseUnit) / firstTierBase
      : 0
    : getQuantityDiscountRate(safeQuantity)
  const discountedUnitPriceCents = normalizedTiers.length
    ? beforeDiscountUnit
    : Math.round(beforeDiscountUnit * (1 - quantityDiscountRate))
  const sideSurchargeTotalCents = sideSurchargePerUnitCents * safeQuantity
  const totalPriceCents = discountedUnitPriceCents * safeQuantity

  return {
    baseUnitPriceCents: baseUnit,
    sideSurchargePerUnitCents,
    sideSurchargeTotalCents,
    quantityDiscountRate,
    hasBulkPricing: normalizedTiers.length > 0,
    activeBulkTier,
    bulkPricingTiers: normalizedTiers.length ? normalizedTiers : undefined,
    discountedUnitPriceCents,
    totalPriceCents,
  }
}

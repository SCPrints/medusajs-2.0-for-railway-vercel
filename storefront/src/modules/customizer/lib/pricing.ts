import { PricingBreakdown, PricingInput } from "./types"

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

export const formatCurrency = (amountCents: number, currencyCode = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amountCents / 100)

export const calculatePricing = ({
  basePriceCents,
  decoratedSidesCount,
  totalQuantity,
}: PricingInput): PricingBreakdown => {
  const safeQuantity = Math.max(1, Math.floor(totalQuantity || 1))
  const decoratedSides = Math.max(0, Math.floor(decoratedSidesCount || 0))
  const sideSurchargePerUnitCents = decoratedSides * SIDE_SURCHARGE_CENTS
  const baseUnit = Math.max(0, Math.floor(basePriceCents))
  const beforeDiscountUnit = baseUnit + sideSurchargePerUnitCents
  const quantityDiscountRate = getQuantityDiscountRate(safeQuantity)
  const discountedUnitPriceCents = Math.round(beforeDiscountUnit * (1 - quantityDiscountRate))
  const sideSurchargeTotalCents = sideSurchargePerUnitCents * safeQuantity
  const totalPriceCents = discountedUnitPriceCents * safeQuantity

  return {
    baseUnitPriceCents: baseUnit,
    sideSurchargePerUnitCents,
    sideSurchargeTotalCents,
    quantityDiscountRate,
    discountedUnitPriceCents,
    totalPriceCents,
  }
}

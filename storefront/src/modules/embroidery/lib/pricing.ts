import type {
  Breakdown,
  PricingConfig,
  QuantityTier,
  StitchTier,
} from "./types"

const QUANTITY_TIERS: QuantityTier[] = [
  { minQuantity: 1, label: "1–11" },
  { minQuantity: 12, label: "12–23" },
  { minQuantity: 24, label: "24–47" },
  { minQuantity: 48, label: "48–71" },
  { minQuantity: 72, label: "72–143" },
  { minQuantity: 144, label: "144+" },
]

/** Retail price level — walk-in customers, no contract. */
export const RETAIL_CONFIG: PricingConfig = {
  id: "retail",
  label: "Retail",
  minimumQuantity: 1,
  digitizingFee: 60,
  quantityTiers: QUANTITY_TIERS,
  stitchTiers: [
    { maxStitches: 5000, prices: [12.0, 10.5, 9.0, 8.0, 7.0, 6.0] },
    { maxStitches: 8000, prices: [14.0, 12.5, 11.0, 10.0, 9.0, 8.0] },
    { maxStitches: 12000, prices: [16.5, 15.0, 13.5, 12.5, 11.5, 10.5] },
    { maxStitches: 16000, prices: [19.0, 17.5, 16.0, 15.0, 14.0, 13.0] },
    {
      maxStitches: null,
      isIncrementalRow: true,
      prices: [2.5, 2.25, 2.0, 1.85, 1.7, 1.55],
    },
  ],
}

/** Wholesale / contract price level — pre-digitized files, lower per-unit cost, higher minimum. */
export const WHOLESALE_CONFIG: PricingConfig = {
  id: "wholesale",
  label: "Wholesale",
  minimumQuantity: 24,
  digitizingFee: 0,
  quantityTiers: QUANTITY_TIERS,
  stitchTiers: [
    { maxStitches: 5000, prices: [9.0, 8.0, 7.0, 6.0, 5.25, 4.5] },
    { maxStitches: 8000, prices: [10.5, 9.5, 8.5, 7.5, 6.75, 6.0] },
    { maxStitches: 12000, prices: [12.5, 11.5, 10.5, 9.5, 8.75, 8.0] },
    { maxStitches: 16000, prices: [14.5, 13.5, 12.5, 11.5, 10.75, 10.0] },
    {
      maxStitches: null,
      isIncrementalRow: true,
      prices: [2.0, 1.8, 1.6, 1.5, 1.4, 1.3],
    },
  ],
}

export const PRICE_LEVELS: PricingConfig[] = [RETAIL_CONFIG, WHOLESALE_CONFIG]
export const DEFAULT_PRICING_CONFIG = RETAIL_CONFIG

const findQuantityTierIndex = (config: PricingConfig, quantity: number) => {
  let index = 0
  for (let i = 0; i < config.quantityTiers.length; i++) {
    if (quantity >= config.quantityTiers[i].minQuantity) {
      index = i
    }
  }
  return index
}

const findFlatStitchTier = (config: PricingConfig, stitches: number) => {
  return config.stitchTiers.find(
    (tier) => !tier.isIncrementalRow && tier.maxStitches !== null && stitches <= tier.maxStitches
  )
}

const findHighestFlatTier = (config: PricingConfig) => {
  const flatTiers = config.stitchTiers.filter(
    (tier): tier is StitchTier & { maxStitches: number } =>
      !tier.isIncrementalRow && tier.maxStitches !== null
  )
  return flatTiers[flatTiers.length - 1]
}

const findIncrementalTier = (config: PricingConfig) =>
  config.stitchTiers.find((tier) => tier.isIncrementalRow)

export type CalculatePriceInput = {
  config?: PricingConfig
  stitchCount: number
  quantity: number
  /** When true, treat orderQuantity as already-consolidated across placements. */
  consolidatedQuantity?: boolean
  includeDigitizing?: boolean
}

export const calculatePrice = ({
  config = DEFAULT_PRICING_CONFIG,
  stitchCount,
  quantity,
  consolidatedQuantity = false,
  includeDigitizing = true,
}: CalculatePriceInput): Breakdown => {
  const safeStitches = Math.max(0, Math.round(stitchCount))
  const safeQuantity = Math.max(1, Math.round(quantity))
  const effectiveQuantity = consolidatedQuantity ? safeQuantity : safeQuantity
  const tierIndex = findQuantityTierIndex(config, effectiveQuantity)
  const appliedTier = config.quantityTiers[tierIndex]

  let unitDecorationPrice = 0

  const flatTier = findFlatStitchTier(config, safeStitches)
  if (flatTier) {
    unitDecorationPrice = flatTier.prices[tierIndex]
  } else {
    const highest = findHighestFlatTier(config)
    const incremental = findIncrementalTier(config)
    if (highest && incremental && highest.maxStitches !== null) {
      const overflow = Math.max(0, safeStitches - highest.maxStitches)
      const blocks = Math.ceil(overflow / 1000)
      unitDecorationPrice =
        highest.prices[tierIndex] + blocks * incremental.prices[tierIndex]
    } else {
      unitDecorationPrice = 0
    }
  }

  const decorationSubtotal = unitDecorationPrice * safeQuantity
  const digitizingFee = includeDigitizing ? config.digitizingFee : 0
  const total = decorationSubtotal + digitizingFee

  return {
    level: config,
    stitchCount: safeStitches,
    quantity: safeQuantity,
    effectiveQuantity,
    appliedTier,
    unitDecorationPrice,
    decorationSubtotal,
    digitizingFee,
    total,
    belowMinimum: safeQuantity < config.minimumQuantity,
    consolidatedQuantity,
  }
}

/** Returns the rendered price grid for display. Each cell is per-unit decoration price. */
export const buildPriceTable = (config: PricingConfig = DEFAULT_PRICING_CONFIG) => ({
  quantityTiers: config.quantityTiers,
  rows: config.stitchTiers.map((tier) => ({
    label: tier.isIncrementalRow
      ? "+1,000 stitches"
      : tier.maxStitches !== null
      ? `Up to ${tier.maxStitches.toLocaleString()}`
      : "",
    isIncrementalRow: Boolean(tier.isIncrementalRow),
    prices: tier.prices,
  })),
})

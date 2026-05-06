export type StitchTier = {
  /** Upper bound of stitch count for this tier (inclusive). Last tier has `null` and represents the per-1k incremental row. */
  maxStitches: number | null
  /** Per-unit price for this stitch tier × the matching quantity tier. */
  prices: number[]
  isIncrementalRow?: boolean
}

export type QuantityTier = {
  /** Lower bound of order quantity (inclusive). */
  minQuantity: number
  label: string
}

export type PricingConfig = {
  id: string
  label: string
  /** Minimum order quantity. Below this, `belowMinimum` is true on the breakdown. */
  minimumQuantity: number
  /** Quantity tiers, ordered ascending by `minQuantity`. */
  quantityTiers: QuantityTier[]
  /** Stitch tiers, ordered ascending by `maxStitches`. Final tier should have `maxStitches: null` and `isIncrementalRow: true`. */
  stitchTiers: StitchTier[]
  /** One-off digitizing fee charged once per design. */
  digitizingFee: number
}

export type Breakdown = {
  level: PricingConfig
  stitchCount: number
  quantity: number
  effectiveQuantity: number
  appliedTier: QuantityTier
  unitDecorationPrice: number
  decorationSubtotal: number
  digitizingFee: number
  total: number
  belowMinimum: boolean
  consolidatedQuantity: boolean
}

export type ArchMode = "straight" | "arch_up" | "arch_down"

export type LetteringConfig = {
  text: string
  font: string
  heightMm: number
  archMode: ArchMode
}

export type ArtworkConfig = {
  fileName?: string
  fileSize?: number
  manualStitchCount?: number
  /** Populated by Phase 2 AI analysis */
  aiEstimate?: {
    stitchesMin: number
    stitchesMax: number
    complexity: "low" | "medium" | "high"
    notes?: string
  }
}

export type EmbroideryDesign = {
  type: "lettering" | "artwork"
  stitchCount: number
  lettering?: LetteringConfig
  artwork?: ArtworkConfig
  pricing: Breakdown
}

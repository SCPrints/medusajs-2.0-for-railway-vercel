export type GarmentSide = "front" | "back" | "left_sleeve" | "right_sleeve"

export type CustomizerElementType = "image" | "text" | "shape"

export type SideLayout = {
  side: GarmentSide
  objects: Record<string, unknown>[]
}

export type SizeQuantity = {
  size: string
  quantity: number
}

export type PricingInput = {
  basePriceCents: number
  decoratedSidesCount: number
  totalQuantity: number
  bulkPricingTiers?: BulkPricingTier[]
}

export type BulkPricingTier = {
  minQuantity: number
  maxQuantity?: number
  amountCents: number
}

export type PricingBreakdown = {
  baseUnitPriceCents: number
  sideSurchargePerUnitCents: number
  sideSurchargeTotalCents: number
  quantityDiscountRate: number
  hasBulkPricing: boolean
  activeBulkTier?: BulkPricingTier
  bulkPricingTiers?: BulkPricingTier[]
  discountedUnitPriceCents: number
  totalPriceCents: number
}

export type RenderPlacement = {
  x: number
  y: number
  width: number
  height: number
}

export type RenderSidePayload = {
  side: GarmentSide
  artworkSvg: string
  garmentImageUrl: string | null
  placement: RenderPlacement
}

export type RenderArtifact = {
  side: GarmentSide
  printUrl: string | null
  mockupUrl: string | null
}

export type CustomizerMetadata = {
  version: 2
  type: "fabric_customizer"
  productId: string
  variantId: string
  sideLayouts: SideLayout[]
  printArea: RenderPlacement
  sizes: SizeQuantity[]
  pricing: PricingBreakdown
  artifacts: RenderArtifact[]
}

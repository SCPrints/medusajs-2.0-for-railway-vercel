import { MedusaError } from "@medusajs/framework/utils"

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Resolve garment-only unit amount for SCP pricing lines (AUD major units / Medusa `price.amount` scale):
 * 1) Prefer `metadata.bulk_pricing.tiers` (major-unit amounts, same as storefront).
 * 2) Else use Remote Query `calculated_price` for this variant with cart pricing context.
 */
type BulkTier = {
  minQuantity: number
  maxQuantity?: number
  amountMajor: number
}

type CartPricingLike = {
  id?: string
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
  region?: { currency_code?: string | null } | null
}

const toFiniteInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toFiniteMajorAmount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function normalizeBulkPricingTiersFromVariantMetadata(
  metadata: Record<string, unknown> | null | undefined
): BulkTier[] {
  const bulkPricing = metadata?.bulk_pricing as { tiers?: Array<Record<string, unknown>> } | undefined
  if (!bulkPricing || !Array.isArray(bulkPricing.tiers)) {
    return []
  }

  const tiers = (bulkPricing.tiers
    .map((tier) => {
      const minQuantity = toFiniteInt(tier.min_quantity)
      const maxQuantity = toFiniteInt(tier.max_quantity)
      const amountMajor = toFiniteMajorAmount(tier.amount)
      if (minQuantity === null || amountMajor === null) {
        return null
      }
      return {
        minQuantity,
        maxQuantity: maxQuantity ?? undefined,
        amountMajor,
      }
    })
    .filter((tier) => tier !== null) as BulkTier[])
    .sort((a, b) => a.minQuantity - b.minQuantity)

  return tiers
}

const resolveBulkTierMajorForQuantity = (tiers: BulkTier[], quantity: number): number | null => {
  const qty = Math.max(1, Math.floor(quantity || 1))
  const match =
    tiers.find((tier) => {
      if (qty < tier.minQuantity) {
        return false
      }
      if (typeof tier.maxQuantity === "number" && qty > tier.maxQuantity) {
        return false
      }
      return true
    }) ?? tiers[tiers.length - 1]

  return match?.amountMajor ?? null
}

export function garmentMajorFromBulkMetadataOrNull(
  metadata: Record<string, unknown> | null | undefined,
  quantity: number
): number | null {
  const tiers = normalizeBulkPricingTiersFromVariantMetadata(metadata)
  if (!tiers.length) {
    return null
  }
  return resolveBulkTierMajorForQuantity(tiers, quantity)
}

/** Remote Joiner graph runner (`scope.resolve(ContainerRegistrationKeys.QUERY)`). */
export type RemoteJoinerGraphLike = {
  graph: (
    queryObj: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<{ data?: unknown[] }>
}

export function bnLikeToMajorAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return round2(value)
  }
  if (typeof value === "bigint") {
    return round2(Number(value))
  }
  const boxed = value as { numeric?: unknown; raw?: unknown; value?: unknown }
  const raw = boxed?.numeric ?? boxed?.raw ?? boxed?.value
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? round2(n) : null
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return round2(raw)
  }
  return null
}

export async function resolveGarmentUnitAmountMajor(params: {
  query: RemoteJoinerGraphLike
  variantId: string
  quantity: number
  cart: CartPricingLike
}): Promise<number> {
  const { query, variantId, quantity, cart } = params

  const { data: metaRows } = await query.graph({
    entity: "variants",
    filters: { id: variantId },
    fields: ["id", "metadata"],
  })

  const variantMeta = (metaRows?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata

  const bulkMajor = garmentMajorFromBulkMetadataOrNull(variantMeta ?? null, quantity)
  if (bulkMajor !== null && bulkMajor >= 0) {
    return Math.max(0, round2(bulkMajor))
  }

  const currencyCode = cart.currency_code ?? cart.region?.currency_code ?? undefined

  const ctxArgs =
    currencyCode && cart.region_id
      ? {
          context: {
            quantity,
            region_id: cart.region_id,
            currency_code: currencyCode,
            ...(cart.id ? { cart_id: cart.id } : {}),
            ...(cart.sales_channel_id ? { sales_channel_id: cart.sales_channel_id } : {}),
          },
        }
      : {}

  const { data: pricedRows } = await query.graph(
    {
      entity: "variants",
      filters: { id: variantId },
      fields: [
        "id",
        "calculated_price.calculated_amount",
        "calculated_price.currency_code",
      ],
    },
    ctxArgs
  )

  const calculatedAmount = (pricedRows?.[0] as { calculated_price?: { calculated_amount?: unknown } } | undefined)
    ?.calculated_price?.calculated_amount

  const major = bnLikeToMajorAmount(calculatedAmount)
  if (major === null || major < 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not resolve garment unit price for this variant (missing bulk_pricing tiers and calculated_price)."
    )
  }

  return major
}

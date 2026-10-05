import { MedusaError, QueryContext } from "@medusajs/framework/utils"

import { tierForCustomer, type CustomerGroupLike, type Tier } from "./customer-tiers"
import { garmentMajorWithTier } from "./garment-ladder"

// The pure ladder / tier helpers live in garment-ladder.ts (no framework
// imports, so the admin SPA can share them); re-exported for existing callers.
export {
  garmentMajorFromBulkMetadataOrNull,
  garmentMajorWithTier,
  normalizeBulkPricingTiersFromVariantMetadata,
} from "./garment-ladder"

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Resolve garment-only unit amount for SCP pricing lines (AUD major units / Medusa `price.amount` scale):
 * 1) Prefer `metadata.bulk_pricing.tiers` (major-unit amounts, same as storefront).
 * 2) Else use Remote Query `calculated_price` for this variant with cart pricing context.
 */
type CartPricingLike = {
  id?: string
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
  region?: { currency_code?: string | null } | null
}

/**
 * Resolve the pricing tier for a cart's customer (or null for guests / no
 * tier). Reads customer_groups — admin-scope by design, so this runs server
 * side via Remote Query. Soft-fails to null so a lookup hiccup never blocks an
 * add-to-cart; the line then prices at the standard ladder.
 */
export async function resolveTierForCartCustomer(
  query: RemoteJoinerGraphLike,
  customerId: string | null | undefined
): Promise<Tier | null> {
  if (!customerId) return null
  try {
    const { data } = await query.graph({
      entity: "customer",
      filters: { id: customerId },
      fields: ["id", "groups.id", "groups.name", "groups.metadata"],
    })
    const customer = data?.[0] as { groups?: CustomerGroupLike[] } | undefined
    if (!customer) return null
    return tierForCustomer({ groups: customer.groups ?? [] })
  } catch {
    return null
  }
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
  /** Tier customer → flat `cost × multiplier` garment price (replaces the ladder). */
  tier?: Tier | null
}): Promise<number> {
  const { query, variantId, quantity, cart, tier } = params

  const { data: metaRows } = await query.graph({
    entity: "variants",
    filters: { id: variantId },
    fields: ["id", "metadata"],
  })

  const variantMeta = (metaRows?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata

  const garmentMajor = garmentMajorWithTier(variantMeta ?? null, quantity, tier)
  if (garmentMajor !== null && garmentMajor >= 0) {
    return Math.max(0, round2(garmentMajor))
  }

  const currencyCode = cart.currency_code ?? cart.region?.currency_code ?? undefined

  if (!currencyCode) {
    // calculated_price cannot be computed without a currency. The bulk_pricing
    // path above already returned for properly-imported products, so this only
    // bites a product WITHOUT bulk_pricing on a cart with no resolvable
    // currency — surface a clear error instead of Medusa's cryptic one.
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not resolve garment unit price: the cart has no currency_code/region for price calculation."
    )
  }

  // calculated_price MUST be requested with the pricing context wrapped in
  // QueryContext and nested under the `calculated_price` field, inside the
  // query-config object (first arg). A flat context — or a context passed as
  // the second (options) arg — is silently ignored, and Medusa then throws
  // "Method calculatePrices requires currency_code in the pricing context".
  // This branch is only reached for variants WITHOUT bulk_pricing metadata
  // (e.g. RAMO), so the wrong shape stayed latent until such a product shipped.
  const pricingContext: Record<string, unknown> = {
    currency_code: currencyCode,
    quantity,
  }
  if (cart.region_id) {
    pricingContext.region_id = cart.region_id
  }

  const { data: pricedRows } = await query.graph({
    entity: "variants",
    filters: { id: variantId },
    fields: [
      "id",
      "calculated_price.calculated_amount",
      "calculated_price.currency_code",
    ],
    context: {
      calculated_price: QueryContext(pricingContext),
    },
  })

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

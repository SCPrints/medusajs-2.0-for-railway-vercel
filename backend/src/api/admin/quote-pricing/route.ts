import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { TIER_SLUGS, getTierBySlug, type Tier } from "../../../lib/customer-tiers"
import {
  PRINT_CHANNELS,
  priceQuoteJob,
  type QuoteJobSpec,
  type QuotePriceComponent,
  type ResolvedGarment,
} from "../../../lib/quote-pricing"
import { isScpPrintSizeId } from "../../../lib/scp-dtf-print-pricing"
import {
  garmentMajorWithTier,
  normalizeBulkPricingTiersFromVariantMetadata,
  resolveTierForCartCustomer,
} from "../../../lib/scp-resolve-garment-unit-price"
import { parseDecorationPricingClass } from "../../../lib/scp-supacolour-pricing"
import { freightInPerUnit } from "../../../utils/bulk-price-ladder"

/**
 * POST /admin/quote-pricing — price a job for the Quotes "Price a job" panel.
 *
 * Resolves what the pure pricer can't: the garment's sell (ladder or the
 * customer's tier) + supplier cost + decoration flags, the customer's tier,
 * and the hidden setup-fee products — so the returned `lines` carry a
 * `variant_id` and survive quote → cart/order (lines without one are skipped
 * by both the accept and convert-to-order paths).
 */
const sizeId = z.string().refine(isScpPrintSizeId, "unknown print size")

const bodySchema = z.object({
  spec: z.object({
    quantity: z.coerce.number().int().min(1).max(100000),
    prints: z.array(z.object({ sizeId })).max(10).optional(),
    printChannel: z.enum(PRINT_CHANNELS).optional(),
    supacolourRepeatSetup: z.boolean().optional(),
    screen: z
      .object({
        positions: z.array(z.object({ colours: z.coerce.number().int().min(1).max(6), darkGarment: z.boolean().optional() })).max(10),
        heavyGarment: z.boolean().optional(),
        repeatSetup: z.boolean().optional(),
      })
      .optional(),
    embroidery: z.array(z.object({ stitchCount: z.coerce.number().int().min(1).max(200000), digitizing: z.boolean().optional() })).max(10).optional(),
    embroideryPromo: z.boolean().optional(),
    uvdtf: z.object({ metres: z.coerce.number().min(0).max(10000), reorder: z.boolean().optional() }).optional(),
  }),
  variant_id: z.string().max(80).nullable().optional(),
  customer_id: z.string().max(80).nullable().optional(),
  /** Tier override: a slug, "standard" to force the public ladder, or omit for the customer's own tier. */
  tier: z.enum([...TIER_SLUGS, "standard"]).nullable().optional(),
})

export type QuotePricingLine = {
  title: string
  description: string | null
  quantity: number
  unit_price: number
  product_id: string | null
  variant_id: string | null
  product_handle: string | null
  thumbnail: string | null
}

type SetupProductKey = NonNullable<QuotePriceComponent["setupProduct"]>
type ServiceProduct = { product_id: string; variant_id: string; handle: string; title: string }

const SETUP_HANDLES: Record<Exclude<SetupProductKey, "embroidery_setup">, string> = {
  screen_setup: "screen-printing-setup-fee",
  supacolour_setup: "supacolour-transfer-setup-fee",
}

async function resolveSetupProducts(query: any): Promise<Record<SetupProductKey, ServiceProduct | null>> {
  const out: Record<SetupProductKey, ServiceProduct | null> = { screen_setup: null, supacolour_setup: null, embroidery_setup: null }
  const toService = (p: any): ServiceProduct | null =>
    p?.id && p?.variants?.[0]?.id ? { product_id: p.id, variant_id: p.variants[0].id, handle: p.handle, title: p.title } : null
  try {
    const { data } = await query.graph({
      entity: "product",
      filters: { handle: Object.values(SETUP_HANDLES) },
      fields: ["id", "handle", "title", "variants.id"],
    })
    for (const p of data ?? []) {
      for (const [key, handle] of Object.entries(SETUP_HANDLES)) {
        if (p.handle === handle) out[key as SetupProductKey] = toService(p)
      }
    }
    // The embroidery setup product was created by hand in admin (no fixed
    // handle) — same title match as hide-internal-service-products.ts.
    const { data: byTitle } = await query.graph({
      entity: "product",
      filters: { title: { $ilike: "%setup%" } },
      fields: ["id", "handle", "title", "variants.id"],
    })
    const emb = (byTitle ?? []).find((p: any) => /embroidery.*setup|setup.*embroidery|digitiz/i.test(p.title ?? ""))
    out.embroidery_setup = toService(emb)
  } catch {
    /* best effort — unresolved setups fall back to custom lines */
  }
  return out
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Tier: explicit override wins; otherwise the quote's customer's own tier.
  let tier: Tier | null = null
  let tierSource: "override" | "customer" | null = null
  if (body.tier === "standard") {
    tierSource = "override"
  } else if (body.tier) {
    tier = getTierBySlug(body.tier)
    tierSource = "override"
  } else if (body.customer_id) {
    tier = await resolveTierForCartCustomer(query, body.customer_id)
    tierSource = tier ? "customer" : null
  }

  let garment: (ResolvedGarment & { product_id: string; variant_id: string; product_handle: string | null; thumbnail: string | null }) | null = null
  if (body.variant_id) {
    const { data } = await query.graph({
      entity: "variant",
      filters: { id: body.variant_id },
      fields: ["id", "title", "metadata", "product.id", "product.title", "product.handle", "product.thumbnail", "product.metadata"],
    })
    const v = data?.[0] as any
    if (!v) return res.status(404).json({ error: "variant not found" })
    const meta = (v.metadata ?? {}) as Record<string, unknown>
    const costRaw = Number(meta.cost_price_ex_gst_minor)
    let unitCostExMajor = Number.isFinite(costRaw) && costRaw > 0 ? Math.round(costRaw) / 100 : null
    let costEstimated = false
    if (unitCostExMajor == null) {
      // Most variants carry no stamped cost — invert the standard ladder
      // (100+ = cost × 1.1 × 1.5 + freight-in ÷ 100) for an estimate.
      const tiers = normalizeBulkPricingTiersFromVariantMetadata(meta)
      const top = tiers.length ? tiers[tiers.length - 1].amountMajor : Number((meta.bulk_pricing as any)?.tier_100_plus_price)
      if (Number.isFinite(top) && top > 0) {
        unitCostExMajor = Math.round(((top - freightInPerUnit(100)) / 1.65) * 100) / 100
        costEstimated = true
      }
    }
    const productMeta = (v.product?.metadata ?? {}) as Record<string, unknown>
    garment = {
      product_id: v.product?.id,
      variant_id: v.id,
      product_handle: v.product?.handle ?? null,
      thumbnail: v.product?.thumbnail ?? null,
      title: `${v.product?.title ?? "Garment"}${v.title ? ` — ${v.title}` : ""}`,
      unitSellMajor: garmentMajorWithTier(meta, body.spec.quantity, tier),
      unitCostExMajor,
      costEstimated,
      supacolour: parseDecorationPricingClass(productMeta.decoration_pricing_class) === "supacolour",
      screenHeavy: productMeta.screen_heavy === true,
    }
  }

  const price = priceQuoteJob(body.spec as QuoteJobSpec, garment)
  const setups = price.components.some((c) => c.kind === "setup") ? await resolveSetupProducts(query) : null

  // Compose the quote lines: one garment line carrying every per-garment
  // component in its unit price (the shape the accept route locks + carts),
  // then per-metre and setup lines of their own.
  const lines: QuotePricingLine[] = []
  const perGarment = price.components.filter((c) => c.kind === "per_garment")
  if (perGarment.length) {
    const decoration = perGarment.filter((c) => c.key !== "garment").map((c) => c.label).join("; ")
    lines.push(
      garment
        ? { title: garment.title, description: decoration || null, quantity: body.spec.quantity, unit_price: price.perGarmentSellMajor, product_id: garment.product_id, variant_id: garment.variant_id, product_handle: garment.product_handle, thumbnail: garment.thumbnail }
        : { title: "Decoration on customer-supplied garments", description: decoration || null, quantity: body.spec.quantity, unit_price: price.perGarmentSellMajor, product_id: null, variant_id: null, product_handle: null, thumbnail: null }
    )
  }
  for (const c of price.components.filter((c) => c.kind !== "per_garment")) {
    const svc = c.setupProduct && setups ? setups[c.setupProduct] : null
    lines.push({
      title: c.label,
      description: svc ? null : c.kind === "setup" ? "Custom line — add the matching setup product to charge it at checkout." : null,
      quantity: c.quantity,
      unit_price: c.unitSellMajor,
      product_id: svc?.product_id ?? null,
      variant_id: svc?.variant_id ?? null,
      product_handle: svc?.handle ?? null,
      thumbnail: null,
    })
  }

  return res.json({
    price,
    garment,
    tier: tier ? { slug: tier.slug, name: tier.name, multiplier: tier.multiplier } : null,
    tier_source: tierSource,
    lines,
  })
}

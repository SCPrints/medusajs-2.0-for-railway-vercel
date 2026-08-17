import { getTierBySlug } from "../customer-tiers"
import {
  garmentMajorWithTier,
  resolveGarmentUnitAmountMajor,
} from "../scp-resolve-garment-unit-price"
import { recomputeScpCartPricingPure } from "../recompute-scp-cart-pricing"

/**
 * Phase C: SCP/customizer garment lines must charge tier customers the flat
 * `cost × multiplier` price (replacing the bulk ladder) — identical formula to
 * the backend tier PriceList so the customizer charge equals a plain variant's
 * charge. Decoration (print/embroidery) surcharges are NOT tiered.
 */

const platinum = getTierBySlug("platinum")! // 1.30×

const bulkMeta = (extra: Record<string, unknown> = {}) => ({
  bulk_pricing: {
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: 30 },
      { min_quantity: 10, max_quantity: 99, amount: 25 },
      { min_quantity: 100, amount: 20 },
    ],
  },
  ...extra,
})

describe("garmentMajorWithTier", () => {
  it("returns the flat tier price (cost × mult / 100) overriding the bulk ladder", () => {
    // round(1265 × 1.30) = 1645 cents -> 16.45 major
    expect(garmentMajorWithTier(bulkMeta({ cost_price_ex_gst_minor: 1265 }), 12, platinum)).toBe(16.45)
  })

  it("is quantity-independent — the flat price beats even the 100+ band", () => {
    expect(garmentMajorWithTier(bulkMeta({ cost_price_ex_gst_minor: 1265 }), 500, platinum)).toBe(16.45)
  })

  it("falls back to the bulk ladder when the variant has no cost", () => {
    expect(garmentMajorWithTier(bulkMeta(), 12, platinum)).toBe(25)
  })

  it("uses the bulk ladder when there is no tier (cost ignored)", () => {
    expect(garmentMajorWithTier(bulkMeta({ cost_price_ex_gst_minor: 1265 }), 12, null)).toBe(25)
  })

  it("returns null when neither a tier price nor a bulk ladder is available", () => {
    expect(garmentMajorWithTier({ cost_price_ex_gst_minor: 1265 }, 12, null)).toBeNull()
    expect(garmentMajorWithTier({}, 12, platinum)).toBeNull()
  })
})

describe("resolveGarmentUnitAmountMajor with a tier", () => {
  const cart = { id: "c1", currency_code: "aud", region_id: "r1", sales_channel_id: "sc1" }
  const makeQuery = (metadata: Record<string, unknown>) => ({
    calls: [] as any[],
    graph: async (config: any) => {
      ;(makeQuery as any).lastFields = config.fields
      const fields: string[] = config.fields || []
      if (fields.some((f) => String(f).startsWith("calculated_price"))) {
        return { data: [{ id: "v1", calculated_price: { calculated_amount: 99, currency_code: "aud" } }] }
      }
      return { data: [{ id: "v1", metadata }] }
    },
  })

  it("applies the flat tier garment price from variant cost (no calculated_price fallback)", async () => {
    const q = makeQuery(bulkMeta({ cost_price_ex_gst_minor: 1265 }))
    const amount = await resolveGarmentUnitAmountMajor({
      query: q as any,
      variantId: "v1",
      quantity: 12,
      cart,
      tier: platinum,
    })
    expect(amount).toBe(16.45)
  })
})

describe("recomputeScpCartPricingPure with a tier", () => {
  const garmentLine = (id: string, quantity: number) => ({
    id,
    quantity,
    unit_price: 0,
    variant_id: "v1",
    metadata: null, // plain garment line — no print/embroidery component
    variant: { id: "v1", metadata: bulkMeta({ cost_price_ex_gst_minor: 1265 }) },
  })

  it("prices the garment flat at the tier price even when the aggregated qty would hit the 100+ band", () => {
    const res = recomputeScpCartPricingPure([garmentLine("l1", 200)], platinum)
    expect(res.prices.get("l1")).toBe(16.45)
  })

  it("without a tier, the same line uses the aggregated bulk band (100+ -> 20)", () => {
    const res = recomputeScpCartPricingPure([garmentLine("l1", 200)])
    expect(res.prices.get("l1")).toBe(20)
  })
})

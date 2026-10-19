import { getTierBySlug } from "@lib/customer-tiers"
import {
  getTierUnitMajorForVariant,
  getVariantCostMinor,
  productHasTierableCost,
} from "./tier-price"

const platinum = getTierBySlug("platinum")! // 1.30×
const member = getTierBySlug("member")! // 1.65×

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * A variant whose bulk ladder was written by the backend's buildPriceLadder()
 * from `costMinor` cents — the top band is cost × 1.65 (+ freight-in ÷ 100).
 * Cost itself is NOT on the variant: the backend strips it from store responses.
 */
const variant = (costMinor: unknown, freightInAud = 0) => {
  const amount =
    typeof costMinor === "number"
      ? round2((costMinor / 100) * 1.65 + round2(freightInAud / 100))
      : costMinor
  return {
    metadata:
      costMinor === undefined
        ? {}
        : {
            bulk_pricing: {
              freight_in_aud: freightInAud,
              tiers: [
                { min_quantity: 1, max_quantity: 9, amount: 99 },
                { min_quantity: 100, amount },
              ],
            },
          },
  }
}

describe("getVariantCostMinor", () => {
  it("recovers the cost to the cent from the ladder's top band", () => {
    expect(getVariantCostMinor(variant(1265))).toBe(1265)
    expect(getVariantCostMinor(variant(999))).toBe(999)
    expect(getVariantCostMinor(variant(1))).toBe(1)
  })
  it("subtracts the per-unit freight-in stamp older ladders still carry", () => {
    expect(getVariantCostMinor(variant(1265, 15))).toBe(1265)
  })
  it("parses a numeric string amount", () => {
    expect(getVariantCostMinor({ metadata: { bulk_pricing: { tiers: [{ min_quantity: 100, amount: "20.87" }] } } })).toBe(1265)
  })
  it("falls back to the flat tier_100_plus_price field", () => {
    expect(getVariantCostMinor({ metadata: { bulk_pricing: { tier_100_plus_price: 20.87 } } })).toBe(1265)
  })
  it("returns null for missing / zero / negative / non-numeric ladders", () => {
    expect(getVariantCostMinor(variant(undefined))).toBeNull()
    expect(getVariantCostMinor(variant(0))).toBeNull()
    expect(getVariantCostMinor(variant(-5))).toBeNull()
    expect(getVariantCostMinor({ metadata: { bulk_pricing: { tiers: [{ min_quantity: 100, amount: "abc" }] } } })).toBeNull()
    expect(getVariantCostMinor({ metadata: { bulk_pricing: { tiers: [] } } })).toBeNull()
    expect(getVariantCostMinor(null)).toBeNull()
  })
  it("never reads the (stripped) supplier cost field", () => {
    expect(getVariantCostMinor({ metadata: { cost_price_ex_gst_minor: 1265 } })).toBeNull()
  })
})

describe("getTierUnitMajorForVariant", () => {
  it("returns null without a tier", () => {
    expect(getTierUnitMajorForVariant(variant(1265), null)).toBeNull()
  })
  it("returns null when the variant has no ladder", () => {
    expect(getTierUnitMajorForVariant(variant(undefined), platinum)).toBeNull()
  })
  it("computes cost × multiplier in MAJOR units, matching the backend price-list formula", () => {
    // round(1265 × 1.30) = 1645 cents -> 16.45 major
    expect(getTierUnitMajorForVariant(variant(1265), platinum)).toBeCloseTo(16.45, 2)
    // round(1265 × 1.65) = 2087 cents -> 20.87 major (= the public 100+ band)
    expect(getTierUnitMajorForVariant(variant(1265), member)).toBeCloseTo(20.87, 2)
  })
  it("is the same rounding the backend regen uses: round(cost_minor × mult) / 100", () => {
    const cost = 999
    const expected = Math.round(cost * platinum.multiplier) / 100
    expect(getTierUnitMajorForVariant(variant(cost), platinum)).toBe(expected)
  })
})

describe("productHasTierableCost", () => {
  it("true when any variant carries a ladder", () => {
    expect(
      productHasTierableCost({ variants: [variant(undefined), variant(500)] as any })
    ).toBe(true)
  })
  it("false when no variant carries a ladder", () => {
    expect(
      productHasTierableCost({ variants: [variant(undefined), variant(0)] as any })
    ).toBe(false)
  })
  it("false for an empty / missing variant list", () => {
    expect(productHasTierableCost({ variants: [] })).toBe(false)
    expect(productHasTierableCost(null)).toBe(false)
  })
})

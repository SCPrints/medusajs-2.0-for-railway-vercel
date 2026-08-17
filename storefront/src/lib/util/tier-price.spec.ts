import { getTierBySlug } from "@lib/customer-tiers"
import {
  getTierUnitMajorForVariant,
  getVariantCostMinor,
  productHasTierableCost,
} from "./tier-price"

const platinum = getTierBySlug("platinum")! // 1.10×
const member = getTierBySlug("member")! // 1.45×

const variant = (costMinor: unknown) => ({
  metadata: costMinor === undefined ? {} : { cost_price_ex_gst_minor: costMinor },
})

describe("getVariantCostMinor", () => {
  it("reads a positive numeric cost", () => {
    expect(getVariantCostMinor(variant(1265))).toBe(1265)
  })
  it("parses a numeric string cost", () => {
    expect(getVariantCostMinor(variant("1265"))).toBe(1265)
  })
  it("returns null for missing / zero / negative / non-numeric", () => {
    expect(getVariantCostMinor(variant(undefined))).toBeNull()
    expect(getVariantCostMinor(variant(0))).toBeNull()
    expect(getVariantCostMinor(variant(-5))).toBeNull()
    expect(getVariantCostMinor(variant("abc"))).toBeNull()
    expect(getVariantCostMinor(null)).toBeNull()
  })
})

describe("getTierUnitMajorForVariant", () => {
  it("returns null without a tier", () => {
    expect(getTierUnitMajorForVariant(variant(1265), null)).toBeNull()
  })
  it("returns null when the variant has no cost", () => {
    expect(getTierUnitMajorForVariant(variant(undefined), platinum)).toBeNull()
  })
  it("computes cost × multiplier in MAJOR units, matching the backend price-list formula", () => {
    // round(1265 × 1.30) = 1645 cents -> 16.45 major
    expect(getTierUnitMajorForVariant(variant(1265), platinum)).toBeCloseTo(16.45, 2)
    // round(1265 × 1.65) = 2087 cents -> 20.87 major
    expect(getTierUnitMajorForVariant(variant(1265), member)).toBeCloseTo(20.87, 2)
  })
  it("is the same rounding the backend regen uses: round(cost_minor × mult) / 100", () => {
    const cost = 999
    const expected = Math.round(cost * platinum.multiplier) / 100
    expect(getTierUnitMajorForVariant(variant(cost), platinum)).toBe(expected)
  })
})

describe("productHasTierableCost", () => {
  it("true when any variant carries a cost", () => {
    expect(
      productHasTierableCost({ variants: [variant(undefined), variant(500)] as any })
    ).toBe(true)
  })
  it("false when no variant carries a cost", () => {
    expect(
      productHasTierableCost({ variants: [variant(undefined), variant(0)] as any })
    ).toBe(false)
  })
  it("false for an empty / missing variant list", () => {
    expect(productHasTierableCost({ variants: [] })).toBe(false)
    expect(productHasTierableCost(null)).toBe(false)
  })
})

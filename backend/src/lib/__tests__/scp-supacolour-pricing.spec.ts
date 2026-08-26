import {
  SCP_SUPACOLOUR_UNIT_MATRIX,
  SUPACOLOUR_QUOTE_ONLY_SIZES,
  parseDecorationPricingClass,
  supacolourUnitMajorForTier,
} from "../scp-supacolour-pricing"
import {
  computeDecorationTotals,
  fullColourCardFromStoredServer,
} from "../scp-decoration-pricing"

describe("scp-supacolour-pricing", () => {
  it("prices by size and tier from the premium matrix", () => {
    expect(supacolourUnitMajorForTier("up_to_a6", 0)).toBe(12)
    expect(supacolourUnitMajorForTier("up_to_a4", 4)).toBe(12.5)
    expect(supacolourUnitMajorForTier("up_to_a3", 3)).toBe(18)
  })

  it("has no oversize row — quote only", () => {
    expect(SCP_SUPACOLOUR_UNIT_MATRIX.oversize).toBeUndefined()
    expect(SUPACOLOUR_QUOTE_ONLY_SIZES.has("oversize")).toBe(true)
    expect(supacolourUnitMajorForTier("oversize", 0)).toBeNull()
  })

  it("parses the decoration pricing class strictly", () => {
    expect(parseDecorationPricingClass("supacolour")).toBe("supacolour")
    expect(parseDecorationPricingClass("quote_only")).toBe("quote_only")
    expect(parseDecorationPricingClass("dtf")).toBeNull()
    expect(parseDecorationPricingClass(undefined)).toBeNull()
  })

  it("reads the stored card from the server block", () => {
    expect(fullColourCardFromStoredServer({ full_colour_card: "supacolour" })).toBe("supacolour")
    expect(fullColourCardFromStoredServer({})).toBe("dtf")
    expect(fullColourCardFromStoredServer(null)).toBe("dtf")
  })
})

describe("computeDecorationTotals with the supacolour card", () => {
  const metadataWithPrints = (prints: Array<{ side: string; sizeId: string }>) => ({
    customizerDesign: {
      artifacts: prints.map((p) => ({ side: p.side })),
      prints: prints.map((p, i) => ({ objectId: `o${i}`, side: p.side, sizeId: p.sizeId })),
    },
  })

  it("prices print sides off the premium matrix instead of DTF", () => {
    const totals = computeDecorationTotals({
      metadata: metadataWithPrints([{ side: "front", sizeId: "up_to_a4" }]),
      printSizeId: "up_to_a4",
      printTierQuantity: 100,
      embroideryQuantity: 100,
      screenHeavyGarment: false,
      fullColourCard: "supacolour",
    })
    // A4 @ 100+ tier: supacolour $12.50 (DTF would be $9).
    expect(totals.printTotalMajor).toBe(12.5)
    expect(totals.supacolourQuoteSides).toEqual([])
  })

  it("keeps the DTF matrix when no card is set (golden-vector behaviour)", () => {
    const totals = computeDecorationTotals({
      metadata: metadataWithPrints([{ side: "front", sizeId: "up_to_a4" }]),
      printSizeId: "up_to_a4",
      printTierQuantity: 100,
      embroideryQuantity: 100,
      screenHeavyGarment: false,
    })
    expect(totals.printTotalMajor).toBe(9)
  })

  it("flags oversize prints as quote-only at $0 on supacolour garments", () => {
    const totals = computeDecorationTotals({
      metadata: metadataWithPrints([
        { side: "front", sizeId: "oversize" },
        { side: "back", sizeId: "up_to_a6" },
      ]),
      printSizeId: "oversize",
      printTierQuantity: 20,
      embroideryQuantity: 20,
      screenHeavyGarment: false,
      fullColourCard: "supacolour",
    })
    expect(totals.supacolourQuoteSides).toEqual(["front"])
    // Back A6 @ 20-49 tier = $10.50; front contributes $0.
    expect(totals.printTotalMajor).toBe(10.5)
  })
})

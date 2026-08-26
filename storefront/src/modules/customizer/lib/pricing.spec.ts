import { calculatePricing } from "./pricing"

// Field names retain `Cents` for stability; values are major-unit decimals (dollars).
describe("calculatePricing", () => {
  it("applies side surcharges and quantity discounts", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 3,
      totalQuantity: 50,
    })

    expect(pricing.sideSurchargePerUnitCents).toBe(7.5)
    expect(pricing.quantityDiscountRate).toBe(0.15)
    expect(pricing.discountedUnitPriceCents).toBeCloseTo(23.38, 2)
    expect(pricing.totalPriceCents).toBeCloseTo(1168.75, 2)
  })

  it("keeps quantity at minimum one for calculations", () => {
    const pricing = calculatePricing({
      basePriceCents: 15,
      decoratedSidesCount: 1,
      totalQuantity: 0,
    })

    expect(pricing.totalPriceCents).toBeCloseTo(17.5, 2)
  })

  it("uses SCP tiered print dollars when scpPrint is set", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 2,
      totalQuantity: 50,
      scpPrint: { printSizeId: "up_to_a6" },
    })

    // Qty 50 → tier index 3 → A6 $6.00 per location × 2 sides = $12/garment
    expect(pricing.sideSurchargePerUnitCents).toBe(12)
  })

  it("forces only printed_tag to A6 tier price; sleeves take selected size", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 3,
      decoratedSides: ["front", "left_sleeve", "printed_tag"],
      totalQuantity: 10,
      scpPrint: { printSizeId: "up_to_a3" },
    })

    // Qty 10 => tier 1: A3 front $15 + A3 sleeve $15 + A6 printed tag $7.5 = $37.5
    expect(pricing.sideSurchargePerUnitCents).toBe(37.5)
  })

  it("sums per-print pricing when prints[] is supplied (Phase B)", () => {
    // Two A6s on the front + one A4 on the back at qty 1 (tier 0).
    // A6 tier-0 = $8.50, A4 tier-0 = $11.50. Total = 8.5 + 8.5 + 11.5 = $28.50.
    const pricing = calculatePricing({
      basePriceCents: 25,
      decoratedSidesCount: 2,
      decoratedSides: ["front", "back"],
      totalQuantity: 1,
      scpPrint: { printSizeId: "up_to_a6" },
      prints: [
        { side: "front", sizeId: "up_to_a6" },
        { side: "front", sizeId: "up_to_a6" },
        { side: "back", sizeId: "up_to_a4" },
      ],
    })

    expect(pricing.sideSurchargePerUnitCents).toBeCloseTo(28.5, 2)
  })

  it("forces printed_tag prints to A6 even when prints[] requests larger", () => {
    const pricing = calculatePricing({
      basePriceCents: 25,
      decoratedSidesCount: 1,
      decoratedSides: ["printed_tag"],
      totalQuantity: 1,
      scpPrint: { printSizeId: "up_to_a3" },
      // Stale override on the spec — pricing must clamp to A6.
      prints: [{ side: "printed_tag", sizeId: "up_to_a3" }],
    })

    // Tier 0 A6 = $8.50 (not A3 $12.50).
    expect(pricing.sideSurchargePerUnitCents).toBeCloseTo(8.5, 2)
  })

  it("prices full-colour prints off the supacolour card when set", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 100,
      scpPrint: { printSizeId: "up_to_a4" },
      prints: [{ side: "front", sizeId: "up_to_a4" }],
      fullColourCard: "supacolour",
    })
    // A4 @ 100+ on the premium card = $12.50 (DTF would be $9).
    expect(pricing.sideSurchargePerUnitCents).toBe(12.5)
    expect(pricing.fullColourCard).toBe("supacolour")
    expect(pricing.supacolourQuoteRequired).toBeUndefined()
  })

  it("flags oversize prints on supacolour garments as quote-required", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 20,
      scpPrint: { printSizeId: "oversize" },
      prints: [{ side: "front", sizeId: "oversize" }],
      fullColourCard: "supacolour",
    })
    expect(pricing.sideSurchargePerUnitCents).toBe(0)
    expect(pricing.supacolourQuoteRequired).toBe(true)
  })

  it("prices screen sides by colour tier and excludes them from the DTF matrix", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 2,
      decoratedSides: ["front", "back"],
      totalQuantity: 100,
      scpPrint: { printSizeId: "up_to_a4" },
      prints: [
        { side: "front", sizeId: "up_to_a4" },
        { side: "back", sizeId: "up_to_a4" },
      ],
      screen: [{ side: "back", colours: 2 }],
    })
    // Front stays DTF (A4 @ 100+ = $9); back is screen (2-col @ 100-199 = $4.70).
    expect(pricing.sideSurchargePerUnitCents).toBe(9)
    expect(pricing.screenPerUnitCents).toBeCloseTo(4.7, 2)
    expect(pricing.screenRows?.[0]?.effectiveColours).toBe(2)
    expect(pricing.screenBelowMinimum).toBeUndefined()
  })

  it("adds heavy-garment surcharge and flags below-minimum screen quantities", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 10,
      screen: [{ side: "front", colours: 1, darkGarment: true }],
      screenHeavyGarment: true,
    })
    // Below min → tier 0 (25-49): 2 effective colours $10.50 + $1 heavy = $11.50.
    expect(pricing.screenPerUnitCents).toBeCloseTo(11.5, 2)
    expect(pricing.screenBelowMinimum).toBe(true)
    // No DTF component — the only decorated side is screen.
    expect(pricing.sideSurchargePerUnitCents).toBe(0)
  })

  it("ignores prints[] when empty and falls back to side-level pricing", () => {
    const pricing = calculatePricing({
      basePriceCents: 25,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 1,
      scpPrint: { printSizeId: "up_to_a4" },
      prints: [],
    })

    // A4 tier-0 = $11.50 side-level fallback.
    expect(pricing.sideSurchargePerUnitCents).toBe(11.5)
  })

  it("uses bulk tiers as base unit pricing when provided", () => {
    const pricing = calculatePricing({
      basePriceCents: 30,
      decoratedSidesCount: 2,
      totalQuantity: 55,
      bulkPricingTiers: [
        { minQuantity: 1, maxQuantity: 9, amountCents: 23.9 },
        { minQuantity: 10, maxQuantity: 49, amountCents: 21.51 },
        { minQuantity: 50, maxQuantity: 99, amountCents: 19.12 },
        { minQuantity: 100, amountCents: 17.92 },
      ],
    })

    expect(pricing.hasBulkPricing).toBe(true)
    expect(pricing.baseUnitPriceCents).toBe(19.12)
    expect(pricing.sideSurchargePerUnitCents).toBe(5)
    expect(pricing.discountedUnitPriceCents).toBeCloseTo(24.12, 2)
    expect(pricing.totalPriceCents).toBeCloseTo(1326.6, 2)
  })

  it("a tier price replaces the bulk ladder: flat garment unit, no bulk, no qty discount", () => {
    const pricing = calculatePricing({
      basePriceCents: 30,
      decoratedSidesCount: 2,
      totalQuantity: 200, // would hit the 100+ bulk band without a tier
      bulkPricingTiers: [
        { minQuantity: 1, maxQuantity: 9, amountCents: 23.9 },
        { minQuantity: 100, amountCents: 17.92 },
      ],
      tierUnitCents: 13.92, // flat tier garment price (cost × multiplier)
    })

    expect(pricing.tierPriceApplied).toBe(true)
    expect(pricing.hasBulkPricing).toBe(false)
    expect(pricing.bulkPricingTiers).toBeUndefined()
    expect(pricing.activeBulkTier).toBeUndefined()
    expect(pricing.quantityDiscountRate).toBe(0)
    // garment is flat at the tier price; decoration surcharge still applies
    expect(pricing.baseUnitPriceCents).toBe(13.92)
    expect(pricing.sideSurchargePerUnitCents).toBe(5)
    expect(pricing.discountedUnitPriceCents).toBeCloseTo(18.92, 2)
    expect(pricing.totalPriceCents).toBeCloseTo(3784, 2)
  })

  it("ignores a null/invalid tierUnitCents and keeps standard pricing", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 1,
      totalQuantity: 50,
      tierUnitCents: null,
    })
    expect(pricing.tierPriceApplied).toBe(false)
    expect(pricing.quantityDiscountRate).toBe(0.15)
  })

  it("prices embroidered sides by stitch count, not the DTF print matrix (order #44 regression)", () => {
    // Front decorated with embroidery only. The old code priced the front's
    // artwork as an A6 DTF print and never showed an embroidery charge.
    const pricing = calculatePricing({
      basePriceCents: 15.9,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 3,
      bulkPricingTiers: [{ minQuantity: 1, maxQuantity: 9, amountCents: 15.9 }],
      scpPrint: { printSizeId: "up_to_a6" },
      prints: [{ side: "front", sizeId: "up_to_a6" }],
      embroidery: [{ side: "front", stitchCount: 1760, includeDigitizingFee: true }],
    })

    // No print surcharge — the only decorated side is embroidered.
    expect(pricing.sideSurchargePerUnitCents).toBe(0)
    // 1,760 stitches → ≤3k tier @ qty 1–25 = $10.50 + $60/3 digitizing = $30.50
    expect(pricing.embroideryPerUnitCents).toBe(30.5)
    // Unit = garment 15.90 + embroidery 30.50 = 46.40 (matches backend charge)
    expect(pricing.discountedUnitPriceCents).toBe(46.4)
    expect(pricing.totalPriceCents).toBeCloseTo(139.2, 2)
    expect(pricing.embroideryRows).toEqual([
      { side: "front", stitchCount: 1760, unitPriceCents: 30.5, requiresQuote: false },
    ])
  })

  it("mixes print and embroidery sides with each method's own rate", () => {
    const pricing = calculatePricing({
      basePriceCents: 15.9,
      decoratedSidesCount: 2,
      decoratedSides: ["front", "back"],
      totalQuantity: 5,
      bulkPricingTiers: [{ minQuantity: 1, maxQuantity: 9, amountCents: 15.9 }],
      scpPrint: { printSizeId: "up_to_a6" },
      prints: [
        { side: "front", sizeId: "up_to_a6" },
        { side: "back", sizeId: "up_to_a6" },
      ],
      embroidery: [{ side: "front", stitchCount: 3000, includeDigitizingFee: false }],
    })

    // Back A6 print at tier 0 = $8.50; front is embroidery-only.
    expect(pricing.sideSurchargePerUnitCents).toBe(8.5)
    // 3,000 stitches @ 1–25 = $10.50, no digitizing
    expect(pricing.embroideryPerUnitCents).toBe(10.5)
    expect(pricing.discountedUnitPriceCents).toBe(34.9)
  })

  it("flags embroidery above the auto-priced stitch cap as quote-required at $0", () => {
    const pricing = calculatePricing({
      basePriceCents: 20,
      decoratedSidesCount: 1,
      decoratedSides: ["front"],
      totalQuantity: 10,
      embroidery: [{ side: "front", stitchCount: 15000 }],
    })
    expect(pricing.embroideryPerUnitCents).toBe(0)
    expect(pricing.embroideryRows?.[0]?.requiresQuote).toBe(true)
  })
})

import {
  buildPriceLadder,
  buildBulkPricingMetadata,
  toMinorAud,
  freightInPerUnit,
  FREIGHT_IN_ALLOWANCE_AUD,
} from "../bulk-price-ladder"

describe("bulk-price-ladder", () => {
  describe("buildPriceLadder", () => {
    /**
     * Regression guard for the AS Colour-style markup formula. Both the
     * AS Colour API importer and the FashionBiz importer use this shape;
     * any change to the math needs both importers and storefront tier
     * display to be updated in lockstep.
     */
    it("matches the canonical $6.95 cost ladder (+ freight-in allowance)", () => {
      const ladder = buildPriceLadder(6.95)
      // tier100Plus = 6.95 * 1.65 = 11.4675 + 15/100 → 11.62
      expect(ladder.tier100Plus).toBe(11.62)
      // standard = 11.4675 / 0.75 = 15.29 + full $15 freight → 30.29
      expect(ladder.standard).toBe(30.29)
      expect(ladder.base).toBe(30.29)
      // 15.29 * 0.9 = 13.761 + 15/10 → 15.26
      expect(ladder.tier10to19).toBe(15.26)
      // 15.29 * 0.85 = 12.9965 + 15/20 → 13.75
      expect(ladder.tier20to49).toBe(13.75)
      // 15.29 * 0.8 = 12.232 + 15/50 → 12.53
      expect(ladder.tier50to99).toBe(12.53)
    })

    it("matches the $10.50 FashionBiz P400MS 1-99 tier (+ freight-in)", () => {
      const ladder = buildPriceLadder(10.5)
      // tier100Plus = 10.5 * 1.65 = 17.325 + 0.15 → 17.48
      expect(ladder.tier100Plus).toBe(17.48)
      // standard = 17.325 / 0.75 = 23.1 + 15 → 38.10
      expect(ladder.standard).toBe(38.1)
      expect(ladder.base).toBe(38.1)
      expect(ladder.tier10to19).toBe(22.29)
      expect(ladder.tier20to49).toBe(20.39)
      expect(ladder.tier50to99).toBe(18.78)
    })

    it("amortizes the freight-in allowance over each band's minimum quantity", () => {
      expect(freightInPerUnit(1)).toBe(FREIGHT_IN_ALLOWANCE_AUD)
      expect(freightInPerUnit(10)).toBe(1.5)
      expect(freightInPerUnit(20)).toBe(0.75)
      expect(freightInPerUnit(50)).toBe(0.3)
      expect(freightInPerUnit(100)).toBe(0.15)
      // qty 0 / negative clamp to 1 (full freight)
      expect(freightInPerUnit(0)).toBe(FREIGHT_IN_ALLOWANCE_AUD)
    })

    it("rounds all outputs to 2dp", () => {
      const ladder = buildPriceLadder(7.13)
      for (const v of Object.values(ladder)) {
        expect(Math.round(v * 100) / 100).toBe(v)
      }
    })
  })

  describe("buildBulkPricingMetadata", () => {
    it("emits the flat keys the storefront expects", () => {
      const ladder = buildPriceLadder(6.95)
      const meta = buildBulkPricingMetadata(ladder)
      // `toMatchObject` (not `toEqual`) — the function ALSO emits a
      // `tiers` array consumed by getBulkPricingTiers(). The flat fields
      // are the legacy contract; the tiers array is the modern one. Both
      // ship together for backwards compat.
      expect(meta).toMatchObject({
        freight_in_aud: FREIGHT_IN_ALLOWANCE_AUD,
        base_sale_price: 30.29,
        tier_10_to_19_price: 15.26,
        tier_20_to_49_price: 13.75,
        tier_50_to_99_price: 12.53,
        tier_100_plus_price: 11.62,
      })
    })

    it("also emits the tiers array consumed by getBulkPricingTiers", () => {
      const ladder = buildPriceLadder(6.95)
      const meta = buildBulkPricingMetadata(ladder) as { tiers: unknown[] }
      expect(Array.isArray(meta.tiers)).toBe(true)
      expect(meta.tiers).toHaveLength(5)
      expect(meta.tiers[0]).toMatchObject({
        min_quantity: 1,
        max_quantity: 9,
        amount: 30.29,
      })
      expect(meta.tiers[4]).toMatchObject({
        min_quantity: 100,
        amount: 11.62,
      })
    })
  })

  describe("toMinorAud", () => {
    it("converts dollars to cents with rounding", () => {
      expect(toMinorAud(15.29)).toBe(1529)
      expect(toMinorAud(11.4675)).toBe(1147)
      expect(toMinorAud(0)).toBe(0)
    })
  })
})

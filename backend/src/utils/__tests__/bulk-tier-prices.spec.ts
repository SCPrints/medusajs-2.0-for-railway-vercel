import {
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
  type TierMoneyMinor,
} from "../bulk-tier-prices"

describe("bulk-tier-prices", () => {
  const tiers: TierMoneyMinor = {
    base: 1000,
    t10: 900,
    t50: 800,
    t100: 700,
  }

  it("tierMinorToPriceSetRows matches quantity bands", () => {
    const rows = tierMinorToPriceSetRows(tiers)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      amount: 1000,
      currency_code: "aud",
      min_quantity: 1,
      max_quantity: 9,
    })
    expect(rows[3]).toMatchObject({
      amount: 700,
      currency_code: "aud",
      min_quantity: 100,
    })
    expect(rows[3]).not.toHaveProperty("max_quantity")
  })

  it("tierMinorToBulkPricingMetadata includes tiers array", () => {
    const meta = tierMinorToBulkPricingMetadata(tiers)
    expect(meta.source).toBe("spreadsheet-sync")
    expect(meta.currency_code).toBe("aud")
    expect(Array.isArray((meta as { tiers: unknown }).tiers)).toBe(true)
  })
})

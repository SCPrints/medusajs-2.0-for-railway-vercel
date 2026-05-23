import {
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
  type TierMoneyMinor,
} from "../bulk-tier-prices"

describe("bulk-tier-prices", () => {
  const tiers: TierMoneyMinor = {
    t1_9: 1000,
    t10_19: 950,
    t20_49: 900,
    t50_99: 850,
    t100_plus: 800,
  }

  it("tierMinorToPriceSetRows matches five quantity bands", () => {
    // `tierMinorToPriceSetRows` converts minor (input) → major (Medusa
    // `amount` convention) at the boundary, so `t1_9: 1000` cents lands
    // in the price-set row as `amount: 10` dollars.
    const rows = tierMinorToPriceSetRows(tiers)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({
      amount: 10,
      currency_code: "aud",
      min_quantity: 1,
      max_quantity: 9,
    })
    expect(rows[1]).toMatchObject({
      amount: 9.5,
      min_quantity: 10,
      max_quantity: 19,
    })
    expect(rows[2]).toMatchObject({
      amount: 9,
      min_quantity: 20,
      max_quantity: 49,
    })
    expect(rows[3]).toMatchObject({
      amount: 8.5,
      min_quantity: 50,
      max_quantity: 99,
    })
    expect(rows[4]).toMatchObject({
      amount: 8,
      min_quantity: 100,
    })
    expect(rows[4]).not.toHaveProperty("max_quantity")
  })

  it("tierMinorToBulkPricingMetadata includes tiers array", () => {
    const meta = tierMinorToBulkPricingMetadata(tiers)
    expect(meta.source).toBe("spreadsheet-sync")
    expect(meta.currency_code).toBe("aud")
    expect(Array.isArray((meta as { tiers: unknown }).tiers)).toBe(true)
    expect((meta as { tiers: { length: number } }).tiers.length).toBe(5)
  })
})

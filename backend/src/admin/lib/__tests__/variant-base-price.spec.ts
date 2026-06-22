import {
  pickVariantBasePrice,
  type VariantPriceRow,
} from "../variant-base-price"

const row = (over: Partial<VariantPriceRow>): VariantPriceRow => ({
  amount: 0,
  currency_code: "aud",
  ...over,
})

describe("pickVariantBasePrice", () => {
  it("returns null for empty / nullish input", () => {
    expect(pickVariantBasePrice(undefined)).toBeNull()
    expect(pickVariantBasePrice(null)).toBeNull()
    expect(pickVariantBasePrice([])).toBeNull()
  })

  it("picks the qty 1–9 (min_quantity 1) tier from a full bulk ladder", () => {
    // Importer shape: 5 AUD tiers, amounts in MAJOR units (dollars).
    const prices: VariantPriceRow[] = [
      row({ amount: 100, min_quantity: 100 }),
      row({ amount: 12.5, min_quantity: 1, max_quantity: 9 }),
      row({ amount: 11, min_quantity: 10, max_quantity: 19 }),
      row({ amount: 10, min_quantity: 20, max_quantity: 49 }),
      row({ amount: 9, min_quantity: 50, max_quantity: 99 }),
    ]
    const base = pickVariantBasePrice(prices)
    expect(base).toEqual({ amount: 12.5, currency_code: "aud" })
  })

  it("keeps amount in MAJOR units — no ÷100 / ×100 scaling", () => {
    const base = pickVariantBasePrice([row({ amount: 29.95, min_quantity: 1 })])
    expect(base?.amount).toBe(29.95)
  })

  it("prefers AUD over other currencies", () => {
    const prices: VariantPriceRow[] = [
      row({ amount: 8, currency_code: "usd", min_quantity: 1 }),
      row({ amount: 12, currency_code: "aud", min_quantity: 1 }),
    ]
    expect(pickVariantBasePrice(prices)).toEqual({
      amount: 12,
      currency_code: "aud",
    })
  })

  it("falls back to the only currency present when there is no AUD", () => {
    const base = pickVariantBasePrice([
      row({ amount: 7, currency_code: "usd", min_quantity: 1 }),
    ])
    expect(base).toEqual({ amount: 7, currency_code: "usd" })
  })

  it("excludes tier / price-list override rows (those carrying rules)", () => {
    const prices: VariantPriceRow[] = [
      // A customer-tier override (flat rate via price-list rules) — must be ignored.
      row({ amount: 5, min_quantity: 1, rules: { "customer.groups.id": "cg_1" } }),
      // The base catalogue price — must win.
      row({ amount: 12.5, min_quantity: 1, rules: {} }),
    ]
    expect(pickVariantBasePrice(prices)).toEqual({
      amount: 12.5,
      currency_code: "aud",
    })
  })

  it("falls back to the lowest band when no min_quantity === 1 row exists", () => {
    const prices: VariantPriceRow[] = [
      row({ amount: 9, min_quantity: 50 }),
      row({ amount: 11, min_quantity: 10 }),
      row({ amount: 100, min_quantity: 100 }),
    ]
    // Lowest band (min_quantity 10) wins as the base.
    expect(pickVariantBasePrice(prices)?.amount).toBe(11)
  })

  it("treats a missing min_quantity as the base tier (zero-price fallback row)", () => {
    // Importer's unpriced fallback: single AUD row, no min_quantity.
    const base = pickVariantBasePrice([row({ amount: 0 })])
    expect(base).toEqual({ amount: 0, currency_code: "aud" })
  })

  it("falls back to override rows only when no base-ladder row exists", () => {
    // Defensive: if every row carries rules, still return something rather than null.
    const base = pickVariantBasePrice([
      row({ amount: 5, min_quantity: 1, rules: { x: "y" } }),
    ])
    expect(base).toEqual({ amount: 5, currency_code: "aud" })
  })
})

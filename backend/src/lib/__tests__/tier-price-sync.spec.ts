import { planTierPriceSync } from "../tier-price-sync"

describe("planTierPriceSync", () => {
  it("writes only what changed", () => {
    const plan = planTierPriceSync(
      [
        { id: "p1", price_set_id: "ps1", amount: 12.5, currency_code: "aud" },
        { id: "p2", price_set_id: "ps2", amount: "10", currency_code: "aud" },
        { id: "p3", price_set_id: "gone", amount: 5, currency_code: "aud" },
        { id: "p4", price_set_id: "ps1", amount: 12.5, currency_code: "aud" },
      ],
      [
        { price_set_id: "ps1", amount: 12.5, currency_code: "aud" },
        { price_set_id: "ps2", amount: 11, currency_code: "aud" },
        { price_set_id: "new", amount: 7, currency_code: "aud" },
      ]
    )
    expect(plan.add).toEqual([{ price_set_id: "new", amount: 7, currency_code: "aud" }])
    expect(plan.update).toEqual([{ id: "p2", price_set_id: "ps2", amount: 11, currency_code: "aud" }])
    expect(plan.remove.sort()).toEqual(["p3", "p4"])
  })

  it("is a no-op when nothing changed", () => {
    const plan = planTierPriceSync(
      [{ id: "p1", price_set_id: "ps1", amount: 12.499999, currency_code: "aud" }],
      [{ price_set_id: "ps1", amount: 12.5, currency_code: "aud" }]
    )
    expect(plan).toEqual({ add: [], update: [], remove: [] })
  })
})

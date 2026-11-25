import { mergeOrderRoster } from "../roster"

describe("mergeOrderRoster", () => {
  it("keeps the people already on the cart and adds new ones once", () => {
    const out = mergeOrderRoster(
      { people: [{ name: "Ann", unit: "Office", number: null, sizes: {} }], total: 1, truncated: false },
      [
        { name: "ann", unit: "Office", number: null },
        { name: "Ben", unit: null, number: "7" },
        { name: "Ben", unit: null, number: "7" },
      ]
    )
    expect(out?.people.map((p) => p.name)).toEqual(["Ann", "Ben"])
    expect(out?.total).toBe(2)
  })

  it("starts a list on an empty cart", () => {
    expect(mergeOrderRoster(null, [{ name: "Cat" }])?.total).toBe(1)
    expect(mergeOrderRoster(null, [])).toBeNull()
  })
})

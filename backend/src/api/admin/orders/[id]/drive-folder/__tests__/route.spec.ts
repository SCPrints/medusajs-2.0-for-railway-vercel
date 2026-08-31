import { buildSuggestedName } from "../route"

describe("buildSuggestedName", () => {
  it("joins company, person, and display id", () => {
    expect(
      buildSuggestedName({
        display_id: 79,
        billing_address: {
          company: "SC PRINTS",
          first_name: "Sean",
          last_name: "Mudie",
        },
      })
    ).toBe("SC PRINTS | Sean Mudie | 79")
  })

  it("drops company when absent", () => {
    expect(
      buildSuggestedName({
        display_id: 12,
        billing_address: { company: "  ", first_name: "Jo", last_name: "Steele" },
      })
    ).toBe("Jo Steele | 12")
  })

  it("falls back to shipping address then email", () => {
    expect(
      buildSuggestedName({
        display_id: 3,
        billing_address: null,
        shipping_address: { company: "ALS" },
        email: "jo@example.com",
      })
    ).toBe("ALS | jo@example.com | 3")
  })
})

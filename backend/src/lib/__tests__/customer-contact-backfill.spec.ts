import { planCustomerBlanks } from "../customer-contact-backfill"

describe("planCustomerBlanks", () => {
  it("fills only empty fields", () => {
    expect(
      planCustomerBlanks(
        { first_name: null, last_name: "", phone: "0400 000 000" },
        { first_name: " Connor ", last_name: "McGeough", phone: "0466780541" }
      )
    ).toEqual({ first_name: "Connor", last_name: "McGeough" })
  })

  it("never overwrites and ignores blank input", () => {
    expect(planCustomerBlanks({ first_name: "Sam" }, { first_name: "Connor", phone: "  " })).toBeNull()
  })
})

import { draftCustomer } from "../checkout"
import { walkInEmail } from "../../../lib/walk-in"

describe("draftCustomer", () => {
  it("customer with no email: draft on the walk-in inbox alone, relinked after", () => {
    expect(draftCustomer("cus_1", walkInEmail())).toEqual({
      customer_id: undefined,
      email: walkInEmail(),
      relinkTo: "cus_1",
    })
  })

  it("customer with an email: passed straight through", () => {
    expect(draftCustomer("cus_1", "a@b.com")).toEqual({
      customer_id: "cus_1",
      email: "a@b.com",
      relinkTo: null,
    })
  })

  it("plain walk-in (no customer): nothing to relink", () => {
    expect(draftCustomer(null, walkInEmail()).relinkTo).toBeNull()
  })
})

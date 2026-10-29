import { customerFillFromAddress } from "../customer-fill"

const addr = { first_name: " Billy ", last_name: "Osborne", phone: "0429006787", company: "OBC Brickwork" }

describe("customerFillFromAddress", () => {
  it("fills every blank field on a bare guest customer", () => {
    expect(customerFillFromAddress({ email: "b@x.com" }, addr)).toEqual({
      first_name: "Billy",
      last_name: "Osborne",
      phone: "0429006787",
      company_name: "OBC Brickwork",
    })
  })

  it("never overwrites existing values", () => {
    expect(
      customerFillFromAddress(
        { email: "b@x.com", first_name: "Bill", phone: "1", company_name: "Old Co" },
        addr
      )
    ).toEqual({})
  })

  it("skips blank address values and missing addresses", () => {
    expect(customerFillFromAddress({ email: "b@x.com" }, { first_name: "", company: " " })).toEqual({})
    expect(customerFillFromAddress({ email: "b@x.com" }, null)).toEqual({})
  })

  it("leaves our own shared inboxes alone", () => {
    expect(customerFillFromAddress({ email: "walkin@scprints.com.au" }, addr)).toEqual({})
    expect(customerFillFromAddress({ email: "INFO@scprints.com.au" }, addr)).toEqual({})
  })
})

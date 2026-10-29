import { customerAddressFromOrder, customerFillFromAddress, orderAddressIsCustomers } from "../customer-fill"

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

describe("orderAddressIsCustomers", () => {
  it("skips POS sales and organisation fulfilment orders", () => {
    expect(orderAddressIsCustomers({ metadata: { pos_session_id: "pos_1" } })).toBe(false)
    expect(orderAddressIsCustomers({ metadata: { fulfillment_order: true } })).toBe(false)
    expect(orderAddressIsCustomers({ metadata: { source: "quote_convert" } })).toBe(true)
    expect(orderAddressIsCustomers({})).toBe(true)
  })
})

describe("customerAddressFromOrder", () => {
  const ship = {
    first_name: "Billy",
    last_name: "Osborne",
    address_1: " 12 Smith St ",
    address_2: "",
    city: "Penrith",
    province: "NSW",
    postal_code: "2750",
    country_code: "AU",
    phone: "0429006787",
    id: "addr_x",
  }

  it("shapes the delivery address for the address book", () => {
    expect(customerAddressFromOrder({ shipping_address: ship }, "1 Studio Rd")).toEqual({
      first_name: "Billy",
      last_name: "Osborne",
      address_1: "12 Smith St",
      city: "Penrith",
      province: "NSW",
      postal_code: "2750",
      country_code: "au",
      phone: "0429006787",
    })
  })

  it("never saves the studio address, pickups, POS or incomplete addresses", () => {
    expect(customerAddressFromOrder({ shipping_address: { ...ship, address_1: "1 studio rd" } }, "1 Studio Rd")).toBeNull()
    expect(customerAddressFromOrder({ shipping_address: ship, metadata: { delivery_method: "pickup" } }, null)).toBeNull()
    expect(customerAddressFromOrder({ shipping_address: ship, metadata: { pos_session_id: "p" } }, null)).toBeNull()
    expect(customerAddressFromOrder({ shipping_address: { ...ship, city: "" } }, null)).toBeNull()
    expect(customerAddressFromOrder({ shipping_address: null }, null)).toBeNull()
  })
})

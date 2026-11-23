import { freightAmount, isFreightLine } from "../quote-freight"

describe("quote freight lines", () => {
  it("treats the postage lines staff write as freight (#113, #116, #121, #124)", () => {
    for (const title of ["Postage", "Shipping", "Freight to customer", "Delivery — Maroubra NSW 2035", "Express shipping difference", "Courier"]) {
      expect(isFreightLine({ title })).toBe(true)
    }
  })
  it("leaves goods and inbound freight alone", () => {
    for (const title of ["DTF print + inbound freight", "Staple Tee — Black / L", "Rush Order 30% mark up", "Thread — Isacord (incl. freight)"]) {
      expect(isFreightLine({ title })).toBe(false)
    }
  })
  it("prices qty × unit, and refuses a missing price", () => {
    expect(freightAmount({ quantity: 2, unit_price: 7.75 })).toBe(15.5)
    expect(freightAmount({ quantity: 1, unit_price: null })).toBeNull()
    expect(freightAmount({ quantity: 0, unit_price: 10 })).toBeNull()
  })
})

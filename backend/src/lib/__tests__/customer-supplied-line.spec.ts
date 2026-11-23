import { isCustomerSuppliedLine } from "../production-gate"

describe("isCustomerSuppliedLine", () => {
  it("matches the ways staff write it (#115, #125, #133)", () => {
    expect(isCustomerSuppliedLine({ title: "AS Colour Staple Tee — customer supplied" })).toBe(true)
    expect(isCustomerSuppliedLine({ title: "2 Position A6 + A4 Customer supplied Garments" })).toBe(true)
    expect(isCustomerSuppliedLine({ title: "Customer-supplied kids T-shirts:" })).toBe(true)
    expect(isCustomerSuppliedLine({ title: "Print on tees", metadata: { description: "BYO garments" } })).toBe(true)
  })
  it("ignores fees and our own garments", () => {
    expect(isCustomerSuppliedLine({ title: "DTF Setup" })).toBe(false)
    expect(isCustomerSuppliedLine({ title: "AS Colour Classic Tee 5026 - Black" })).toBe(false)
  })
})

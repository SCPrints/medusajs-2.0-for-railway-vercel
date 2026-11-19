import { money, shortDate, unitPriceLabel, validityLabel } from "./format"

describe("account quote formatting", () => {
  it("formats money in AUD", () => {
    expect(money(1234.5)).toBe("$1,234.50")
  })
  it("shows one price, or a range when sizes differ", () => {
    expect(unitPriceLabel({ unit_price: 20, unit_price_max: 20 })).toBe("$20.00")
    expect(unitPriceLabel({ unit_price: 20, unit_price_max: 23 })).toBe("$20.00 – $23.00")
    expect(unitPriceLabel({ unit_price: null, unit_price_max: null })).toBe("")
  })
  it("dates in Sydney time", () => {
    expect(shortDate("2026-12-18T14:30:00Z")).toBe("19 Dec 2026")
    expect(shortDate(null)).toBe("")
  })
  it("only talks about validity when it matters", () => {
    expect(validityLabel("ready", "2026-12-19T00:00:00Z")).toBe("Valid until 19 Dec 2026")
    expect(validityLabel("cart", "2026-12-19T00:00:00Z")).toBe("Valid until 19 Dec 2026")
    expect(validityLabel("expired", "2026-11-01T00:00:00Z")).toBe("Ran out 1 Nov 2026")
    expect(validityLabel("accepted", "2026-12-19T00:00:00Z")).toBe("")
    expect(validityLabel("ready", null)).toBe("")
  })
})

import { cartLineUsesExplicitUnitPrice } from "./cart-line-display-unit"

describe("cartLineUsesExplicitUnitPrice", () => {
  it("shows the charged price on plain lines (sizing kit, tier-priced blanks)", () => {
    expect(cartLineUsesExplicitUnitPrice({ unit_price: 11.93, metadata: { sizing_kit: true } } as any)).toBe(true)
    expect(cartLineUsesExplicitUnitPrice({ unit_price: 11.93, metadata: null } as any)).toBe(true)
  })
  it("keeps the old rules for design lines", () => {
    expect(cartLineUsesExplicitUnitPrice({ unit_price: 40, metadata: { customizerDesign: { pricing: { server: {} } } } } as any)).toBe(true)
    expect(cartLineUsesExplicitUnitPrice({ unit_price: 40, metadata: { customizerDesign: {} } } as any)).toBe(false)
    expect(cartLineUsesExplicitUnitPrice({ unit_price: 40, is_custom_price: true, metadata: { customizerDesign: {} } } as any)).toBe(true)
  })
  it("no usable unit price: falls back", () => {
    expect(cartLineUsesExplicitUnitPrice({ unit_price: undefined } as any)).toBe(false)
  })
})

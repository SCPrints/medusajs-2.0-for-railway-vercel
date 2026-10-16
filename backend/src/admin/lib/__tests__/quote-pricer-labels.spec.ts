import { pricerDesignLabel, pricerGroupTitle, pricerLineTitle, pricerPositionSummary } from "../quote-pricer-labels"

describe("quote-pricer labels", () => {
  const tee = { supplied: false, productTitle: "AS Colour Staple Tee", rowLabel: "", colour: "BLACK", size: "L" }

  it("keeps the plain line title when the group is unnamed", () => {
    expect(pricerLineTitle(tee)).toBe("AS Colour Staple Tee — BLACK / L")
    expect(pricerLineTitle({ ...tee, groupName: "  ", size: "" })).toBe("AS Colour Staple Tee — BLACK (any size)")
    expect(pricerLineTitle({ supplied: true, productTitle: "", rowLabel: "Black hoodies", colour: null, size: "" })).toBe("Customer-supplied — Black hoodies")
  })

  it("prefixes the group name so two groups of one garment differ", () => {
    expect(pricerLineTitle({ ...tee, groupName: "Bull shirt" })).toBe("Bull shirt — AS Colour Staple Tee, Black / L")
    expect(pricerLineTitle({ ...tee, groupName: "Quad shirt", colour: "Natural Heather" })).toBe("Quad shirt — AS Colour Staple Tee, Natural Heather / L")
    expect(pricerLineTitle({ supplied: true, groupName: "Club polos", productTitle: "", rowLabel: "Navy", colour: null, size: "" })).toBe("Club polos — Customer-supplied, Navy")
  })

  it("names snapshot groups and designs", () => {
    expect(pricerGroupTitle({ supplied: false, productTitle: "AS Colour Staple Tee" })).toBe("AS Colour Staple Tee")
    expect(pricerGroupTitle({ supplied: false, productTitle: "AS Colour Staple Tee", groupName: "Bull shirt" })).toBe("Bull shirt — AS Colour Staple Tee")
    expect(pricerGroupTitle({ supplied: true })).toBe("Customer-supplied garments")
    expect(pricerDesignLabel({ label: "A" })).toBe("A")
    expect(pricerDesignLabel({ label: "B", name: "Bull (back)" })).toBe("B — Bull (back)")
  })

  it("states the actual print size and the design", () => {
    expect(pricerPositionSummary({ sideLabel: "Front", method: "print", sizeId: "up_to_a6", design: { label: "A" } })).toBe("Front: Full-colour print up to A6 (10×15 cm) (design A)")
    expect(pricerPositionSummary({ sideLabel: "Back", method: "print", sizeId: "up_to_a3", design: { label: "B", name: "Bull (back)" } })).toBe("Back: Full-colour print up to A3 (29×42 cm) — Bull (back)")
    expect(pricerPositionSummary({ sideLabel: "Back", method: "print", channelShort: "Supacolour", sizeId: "oversize", design: null })).toBe("Back: Supacolour oversize (38×48 cm) (design ?)")
    expect(pricerPositionSummary({ sideLabel: "Front", method: "screen", colours: 2, dark: true, design: { label: "A" } })).toBe("Front: Screen print 2 col + underbase (design A)")
  })
})

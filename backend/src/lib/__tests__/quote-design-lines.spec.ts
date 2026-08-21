import { mapQuoteDesignLines } from "../quote-design-lines"

describe("mapQuoteDesignLines", () => {
  const base = {
    kind: "customizer" as const,
    variant_id: "variant_1",
    product_id: "prod_1",
    product_title: "Heavy Hoodie",
    variant_title: "Black / L",
    quantity: 3,
    metadata: {
      customizerDesign: {
        artifacts: [{ side: "front", mockupUrl: "https://cdn/x/mockup.png" }],
      },
      product_handle: "heavy-hoodie",
      print_size_id: "up_to_a4",
    },
  }

  it("maps prices in cents to major units and computes total", () => {
    const [line] = mapQuoteDesignLines(
      [{ ...base, unit_price_cents: 4550 }],
      "qg_test"
    )
    expect(line.unit_price).toBe(45.5)
    expect(line.total).toBe(136.5)
    expect(line.title).toBe("Heavy Hoodie — Black / L")
    expect(line.group_id).toBe("qg_test")
    expect(line.thumbnail).toBe("https://cdn/x/mockup.png")
    expect(line.product_handle).toBe("heavy-hoodie")
    expect(line.print_size_id).toBe("up_to_a4")
    expect(line.variant_id).toBe("variant_1")
    expect(line.id).toBeTruthy()
  })

  it("keeps price null when unit_price_cents is null (POA lines)", () => {
    const [line] = mapQuoteDesignLines(
      [{ ...base, unit_price_cents: null }],
      "qg_test"
    )
    expect(line.unit_price).toBeNull()
    expect(line.total).toBeNull()
  })

  it("handles missing design + variant title gracefully", () => {
    const [line] = mapQuoteDesignLines(
      [{ ...base, variant_title: null, metadata: {} }],
      "qg_test"
    )
    expect(line.title).toBe("Heavy Hoodie")
    expect(line.customizerDesign).toBeNull()
    expect(line.thumbnail).toBeNull()
    expect(line.product_handle).toBeNull()
  })

  it("preserves a caller-supplied line_id", () => {
    const [line] = mapQuoteDesignLines(
      [{ ...base, line_id: "li_existing" }],
      "qg_test"
    )
    expect(line.id).toBe("li_existing")
  })
})

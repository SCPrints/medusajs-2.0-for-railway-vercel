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

import { attachDesignToPricerLines } from "../quote-design-lines"

describe("attachDesignToPricerLines", () => {
  const items = [
    { id: "jp_r_r1:M", group_id: "g_1", variant_id: "v_m", quantity: 10, unit_price: 25, thumbnail: "https://r2/art.png" },
    { id: "jp_r_r1:any", group_id: "g_1", variant_id: null, quantity: 2, unit_price: 25, thumbnail: null },
    { id: "jp_r_r9:L", group_id: "g_2", variant_id: "v_l", quantity: 1, unit_price: 40, thumbnail: null },
    { id: "manual", group_id: null, quantity: 1, unit_price: 5 },
  ]
  const design = { version: 3, artifacts: [{ side: "front", mockupUrl: "https://r2/mock.png" }], sideLayouts: [] }

  it("stamps the design + mockup on every line of the group and keeps the pricer's numbers", () => {
    const { items: out, mockupUrl } = attachDesignToPricerLines(items, "g_1", design, "up_to_a4")
    expect(mockupUrl).toBe("https://r2/mock.png")
    expect(out[0]).toMatchObject({ quantity: 10, unit_price: 25, thumbnail: "https://r2/mock.png", print_size_id: "up_to_a4" })
    expect(out[0].customizerDesign.variantId).toBe("v_m")
    expect(out[1].customizerDesign.variantId).toBeUndefined()
    expect(out[2]).toBe(items[2])
    expect(out[3]).toBe(items[3])
  })

  it("leaves the group alone when no design was posted", () => {
    const { items: out, mockupUrl } = attachDesignToPricerLines(items, "g_1", null)
    expect(mockupUrl).toBeNull()
    expect(out[0].thumbnail).toBe("https://r2/art.png")
    expect(out[0].customizerDesign).toBeNull()
  })
})

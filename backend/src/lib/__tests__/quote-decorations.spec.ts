import { buildQuoteDecorations } from "../quote-decorations"

// Shape copied from prod quote Q-3HGYD4KWZ4 (two size lines, one design group).
const design = {
  group_id: "qg_1",
  sideDecorationMethods: { front: "embroidery" },
  sideEmbroideryConfigs: {
    front: { side: "front", widthMm: 80, heightMm: 80, stitchCount: 20500 },
  },
  prints: [
    { side: "front", sizeId: "up_to_a6", approxCm: { width: 5.5, height: 4.8 } },
    { side: "back", sizeId: "up_to_a3", approxCm: { width: 18.8, height: 14.8 } },
    { side: "back", sizeId: "oversize", approxCm: { width: 19, height: 7.7 } },
    { side: "right_sleeve", sizeId: "up_to_a3", approxCm: { width: 10.6, height: 25.2 } },
  ],
}

describe("buildQuoteDecorations", () => {
  it("lists one row per decoration, deduped across size lines", () => {
    const quote = {
      line_items: {
        items: [
          { id: "a", group_id: "qg_1", title: "Hoodie — Black / XXS", customizerDesign: design },
          { id: "b", group_id: "qg_1", title: "Hoodie — Black / S", customizerDesign: design },
        ],
      },
    }
    const rows = buildQuoteDecorations(quote)
    expect(rows.map((r) => [r.side_label, r.method])).toEqual([
      ["Front", "Embroidery"],
      ["Back (1 of 2)", "DTF print"],
      ["Back (2 of 2)", "DTF print"],
      ["Right sleeve", "DTF print"],
    ])
    expect(rows[0].detail).toBe("approx. 80 × 80 mm, ~20,500 stitches")
    expect(rows[0].garment).toBe("Hoodie — Black")
  })

  it("returns nothing for catalog-only quotes", () => {
    expect(buildQuoteDecorations({ line_items: { items: [{ id: "x" }] } })).toEqual([])
  })
})

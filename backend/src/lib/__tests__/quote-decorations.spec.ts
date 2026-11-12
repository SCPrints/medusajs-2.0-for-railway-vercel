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

// Q-21TSM3H3PE: a Studio mockup with no technique attached to a screen-priced
// pricer group read "DTF print" to the customer, next to screen setup lines.
describe("buildQuoteDecorations — Job pricer technique", () => {
  it("uses the priced technique when the Studio design leaves it unset", () => {
    const quote = {
      metadata: {
        job_pricer: {
          state: {
            groups: [
              {
                id: "g_1",
                positions: [
                  { side: "left_chest", method: "screen", colours: "2" },
                  { side: "back", method: "screen", colours: "2" },
                ],
              },
            ],
          },
        },
      },
      line_items: {
        items: [
          {
            id: "jp_r_1",
            group_id: "g_1",
            title: "Tee — Black (any size)",
            customizerDesign: {
              prints: [
                { side: "front", approxCm: { width: 16.2, height: 4.4 } },
                { side: "back", approxCm: { width: 39.9, height: 23.9 } },
              ],
            },
          },
        ],
      },
    }
    expect(buildQuoteDecorations(quote).map((r) => [r.side_label, r.method, r.detail])).toEqual([
      ["Front", "Screen print", "approx. 16.2 × 4.4 cm, 2 colours"],
      ["Back", "Screen print", "approx. 39.9 × 23.9 cm, 2 colours"],
    ])
  })
})

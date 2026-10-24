import { groupJobLines, lineGroup, type RawJobLine } from "../job-lines"

const raw = (over: Partial<RawJobLine> & { id: string; title: string }): RawJobLine => ({
  subtitle: null,
  quantity: 1,
  unit_price: 48.9,
  total: 48.9,
  thumbnail: null,
  decorated: true,
  ...over,
})

describe("groupJobLines", () => {
  it("folds pricer lines into one row per colour with a size string, keeping the design group's margin", () => {
    const lines = [
      raw({ id: "jp_r_row1:S", title: "Harbourside — Sprint Polo, Navy / S", quantity: 4, total: 195.6, group_id: "g1" }),
      raw({ id: "jp_r_row1:M", title: "Harbourside — Sprint Polo, Navy / M", quantity: 10, total: 489, group_id: "g1", thumbnail: "navy.png" }),
      raw({ id: "jp_r_row1:XL", title: "Harbourside — Sprint Polo, Navy / XL", quantity: 6, total: 293.4, unit_price: 51.9, group_id: "g1" }),
      raw({ id: "jp_r_row2:M", title: "Harbourside — Sprint Polo, White / M", quantity: 5, total: 244.5, group_id: "g1~row2" }),
      raw({ id: "jp_x_setup", title: "Artwork quick fix", quantity: 1, unit_price: 30, total: 30, decorated: false }),
    ]
    const out = groupJobLines(lines, (_k, l) => (l.group_id?.startsWith("g1") ? 41 : null))
    expect(out.map((l) => [l.title, l.quantity, l.sizes, l.total, l.margin_pct])).toEqual([
      ["Harbourside — Sprint Polo, Navy", 20, "S 4 · M 10 · XL 6", 978, 41],
      ["Harbourside — Sprint Polo, White", 5, "M 5", 244.5, 41],
      ["Artwork quick fix", 1, null, 30, null],
    ])
    expect(out[0]).toMatchObject({ unit_price: 48.9, unit_price_max: 51.9, thumbnail: "navy.png", decorated: true, line_ids: ["jp_r_row1:S", "jp_r_row1:M", "jp_r_row1:XL"] })
  })

  it("groups order items by product + colour option, reading the size from the option values", () => {
    const lines = [
      raw({ id: "oli_1", title: "Staple Tee / Black / M", quantity: 3, product_id: "prod_1", option_values: { Color: "Black", Size: "M" } }),
      raw({ id: "oli_2", title: "Staple Tee / Black / 2XL", quantity: 1, product_id: "prod_1", option_values: { Color: "Black", Size: "2XL" } }),
      raw({ id: "oli_3", title: "Staple Tee / White / M", quantity: 2, product_id: "prod_1", option_values: { Color: "White", Size: "M" } }),
    ]
    expect(groupJobLines(lines).map((l) => [l.title, l.quantity, l.sizes])).toEqual([
      ["Staple Tee · Black", 4, "M 3 · 2XL 1"],
      ["Staple Tee · White", 2, "M 2"],
    ])
  })

  it("leaves lines it can't group as they are", () => {
    expect(lineGroup(raw({ id: "oli_9", title: "Vectorisation service" }))).toEqual({ key: "oli_9", title: "Vectorisation service", size: null })
    expect(lineGroup(raw({ id: "jp_r_row3:any", title: "Cap, Red (any size)" }))).toEqual({ key: "jp_r_row3", title: "Cap, Red", size: null })
  })
})

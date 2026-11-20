import { garmentKey, groupLines, sizeFromTitle, titleWithoutSize } from "../quote-line-group"

const line = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  description: "Left chest (A6) + back (A3) print, DTF.",
  product_id: "prod_5086",
  group_id: null as string | null,
  ...extra,
})

describe("quote line grouping", () => {
  it("reads the size off both title styles", () => {
    expect(sizeFromTitle("AS Colour Heavy Faded Minus Tee 5086 — Faded Brown — FLC + Back print — Size M")).toBe("M")
    expect(sizeFromTitle("AS Colour Staple Tee — Navy / XL")).toBe("XL")
    expect(sizeFromTitle("Gildan Cap — Black")).toBeNull()
    expect(titleWithoutSize("T-Shirt — Size 2XL")).toBe("T-Shirt")
    expect(titleWithoutSize("Hi-Vis Polo")).toBe("Hi-Vis Polo")
  })

  it("puts every size of one garment + colour on one card (Linda's quote)", () => {
    const base = "AS Colour Heavy Faded Minus Tee 5086 — Faded Brown — FLC + Back print — Size"
    const groups = groupLines([line("a", `${base} M`), line("b", `${base} L`), line("c", `${base} XL`)])
    expect(groups.map((g) => g.map((l) => l.id))).toEqual([["a", "b", "c"]])
  })

  it("keeps different colours, products, designs and descriptions apart", () => {
    const groups = groupLines([
      line("navy-m", "Tee — Navy / M"),
      line("black-m", "Tee — Black / M"),
      line("navy-l", "Tee — Navy / L"),
      line("other", "Tee — Navy / M", { product_id: "prod_other" }),
      line("front-only", "Tee — Navy / S", { description: "Front only" }),
      line("design-2", "Tee — Navy / S", { group_id: "gs_2" }),
      line("custom", "Setup fee", { product_id: null }),
    ])
    expect(groups.map((g) => g.map((l) => l.id))).toEqual([
      ["navy-m", "navy-l"],
      ["black-m"],
      ["other"],
      ["front-only"],
      ["design-2"],
      ["custom"],
    ])
  })

  it("a Studio group wins over the garment key", () => {
    expect(garmentKey(line("a", "Tee — Navy / M", { group_id: "gs_1" }))).toBe("gs_1")
  })
})

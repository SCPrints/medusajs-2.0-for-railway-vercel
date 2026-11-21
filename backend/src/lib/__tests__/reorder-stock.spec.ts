import { checkReorderStock, type StockVariant } from "../reorder-stock"

const v = (id: string, colour: string, size: string, available: number | null): StockVariant => ({
  id,
  title: `${colour} / ${size}`,
  options: { c: colour, s: size },
  available,
})

describe("checkReorderStock", () => {
  const siblings = [
    v("a", "Navy", "M", 50),
    v("b", "Navy", "L", 4),
    v("c", "Navy", "XL", 30),
    v("d", "Black", "L", 99),
  ]
  const base = { line_item_id: "li", title: "Tee", variant_title: "Navy / L", variant_id: "b", siblings, sizeOptionId: "s", sizeOrder: ["S", "M", "L", "XL"] }

  it("flags short stock and suggests nearest size in the same colour (larger on a tie)", () => {
    const [r] = checkReorderStock([{ ...base, wanted: 12, variant: siblings[1] }])
    expect(r.ok).toBe(false)
    expect(r.available).toBe(4)
    expect(r.suggestion?.variant_id).toBe("c")
  })
  it("is ok when enough or untracked", () => {
    expect(checkReorderStock([{ ...base, wanted: 4, variant: siblings[1] }])[0].ok).toBe(true)
    expect(checkReorderStock([{ ...base, wanted: 400, variant: v("x", "Navy", "L", null) }])[0].ok).toBe(true)
  })
})

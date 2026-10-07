import { absorbStudioLines } from "../quote-pricer-absorb"

// The Q-3HGYD4KWZ4 shape: two customer Studio lines + the pricer's two lines.
const studio = [
  { id: "s1", customizerDesign: true, product_id: "p1", variant_id: "v_xxs", thumbnail: "mock.jpg", print_size_id: "up_to_a6" },
  { id: "s2", customizerDesign: true, product_id: "p1", variant_id: "v_s", thumbnail: "mock.jpg", print_size_id: "up_to_a6" },
]
const pricer = (variant: string) => ({ id: `jp_r_row:${variant}`, product_id: "p1", variant_id: variant, thumbnail: "art.png" })

describe("absorbStudioLines", () => {
  it("replaces the customer's lines and carries each design across by variant", () => {
    const r = absorbStudioLines(studio, [pricer("v_xxs"), pricer("v_s")])
    expect(r.manual).toEqual([])
    expect(r.absorbed).toBe(2)
    expect(r.lines.map((l) => [l.design_from, l.customizerDesign, l.thumbnail])).toEqual([
      ["s1", true, "mock.jpg"],
      ["s2", true, "mock.jpg"],
    ])
  })

  it("falls back to the same product's design when the colour/size differs", () => {
    const r = absorbStudioLines(studio, [pricer("v_other")])
    expect(r.lines[0].design_from).toBe("s1")
    expect(r.manual).toEqual([]) // both Studio lines replaced — no double-quoting
  })

  it("drops the customer's lines even when the pricer line already has a design", () => {
    const r = absorbStudioLines(studio, [{ ...pricer("v_s"), customizerDesign: true as const }])
    expect(r.lines[0].design_from).toBeUndefined()
    expect(r.manual).toEqual([])
  })

  it("keeps Studio lines for garments the job doesn't price, and manual lines", () => {
    const other = { id: "s3", customizerDesign: true, product_id: "p2", variant_id: "v9" }
    const custom = { id: "c1", product_id: null, variant_id: null }
    const r = absorbStudioLines([...studio, other, custom], [pricer("v_s")])
    expect(r.manual.map((m) => m.id)).toEqual(["s3", "c1"])
    expect(r.unmatched).toBe(1)
  })
})

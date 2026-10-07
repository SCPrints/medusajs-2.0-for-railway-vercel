import { designPositions, fitPrintSize, slimQuoteLineForAdmin } from "../quote-admin-slim"
import { extendedEmbroideryUnitMajor, priceGroupedJob, type JobSpec } from "../quote-pricing"

const garment = { title: "Hoodie — Black / S", unitSellMajor: 95.83, unitCostExMajor: 40, supacolour: false, screenHeavy: false }

const job = (stitchCount: number, unitSellOverrideMajor?: number): JobSpec => ({
  designs: [{ id: "A", label: "A" }],
  groups: [
    {
      id: "g",
      title: "Hoodie",
      rows: [{ id: "r", label: "Black / S", quantity: 2, garment }],
      positions: [{ method: "embroidery", stitchCount, designId: "A", unitSellOverrideMajor }],
    },
  ],
})

describe("over-cap embroidery in the job pricer", () => {
  it("extends the card at +$1 per 1k above 12k (1–25 band: $16.50 at 12k)", () => {
    expect(extendedEmbroideryUnitMajor(12_000, 2)).toBe(16.5)
    expect(extendedEmbroideryUnitMajor(19_000, 2)).toBe(23.5)
    expect(extendedEmbroideryUnitMajor(20_500, 2)).toBe(25.5)
  })

  it("prices the position (not $0) and still charges digitizing", () => {
    const priced = priceGroupedJob(job(20_000))
    const pos = priced.groups[0].rows[0].components.find((c) => c.key === "pos-0")!
    expect(pos.unitSellMajor).toBe(24.5)
    expect(pos.requiresQuote).toBeFalsy()
    expect(pos.unitCostExMajor).toBeGreaterThan(0)
    expect(priced.extras.some((e) => /digitiz/i.test(e.label))).toBe(true)
  })

  it("a position override replaces the card price", () => {
    const priced = priceGroupedJob(job(20_000, 30))
    const row = priced.groups[0].rows[0]
    expect(row.components.find((c) => c.key === "pos-0")!.unitSellMajor).toBe(30)
    expect(row.unitSellMajor).toBe(125.83)
  })
})

describe("admin slim design summary", () => {
  it("fits prints to the smallest transfer by physical size", () => {
    expect(fitPrintSize(19, 7.7)).toBe("up_to_a4") // Studio had snapped this to Oversize
    expect(fitPrintSize(11.3, 27)).toBe("up_to_a4")
    expect(fitPrintSize(8, 8)).toBe("up_to_a6")
    expect(fitPrintSize(0, 0)).toBeNull()
  })

  it("lists embroidery + each print, and lifts files out of the slimmed design", () => {
    const design = {
      sideDecorationMethods: { front: "embroidery" },
      sideEmbroideryConfigs: { front: { stitchCount: 20500 } },
      prints: [
        { side: "front", sizeId: "up_to_a6", approxCm: { width: 5.5, height: 4.8 } },
        { side: "back", sizeId: "oversize", approxCm: { width: 19, height: 7.7 } },
      ],
      artifacts: [{ side: "back", printUrl: "p.png", mockupUrl: "m.jpg" }],
      customerOriginalFiles: [{ url: "o.png", fileName: "logo.png", sides: ["back"] }],
    }
    expect(designPositions(design)).toEqual([
      { side: "front", method: "embroidery", stitches: 20500 },
      { side: "back", method: "print", sizeId: "up_to_a4" },
    ])
    const slim = slimQuoteLineForAdmin({ id: "l", customizerDesign: design })
    expect(slim.customizerDesign).toBe(true)
    expect(slim.print_urls).toEqual([{ side: "back", url: "p.png" }])
    expect(slim.original_files).toEqual([{ url: "o.png", fileName: "logo.png", sides: ["back"] }])
  })
})

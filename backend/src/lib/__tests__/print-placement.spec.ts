import { computeSidePlacements, formatPlacement } from "../print-placement"

// A 1000×1000 canvas with the A4 print area, built the way the storefront's
// getPrintArea does: areaW = 1000·0.68·14/38, areaH = 1000·0.72·20/48.
const W = 1000
const areaW = W * 0.68 * (14 / 38)
const areaH = W * 0.72 * (20 / 48)
const printArea = { x: (W - areaW) / 2, y: 250, width: areaW, height: areaH }
// One canvas px in mm, horizontally and vertically.
const mmX = 140 / areaW
const mmY = 200 / areaH

const design = (objects: Record<string, unknown>[], side = "front") => ({
  scpPrintSizeId: "up_to_a4",
  printArea,
  sideLayouts: [{ side, objects }],
})

describe("computeSidePlacements", () => {
  it("measures a centred logo from the top of the print zone", () => {
    // 100 mm wide, 50 mm tall, centre on the centre line, top edge 40 mm
    // below the zone top (13% of the canvas = 130 px).
    const w = 100 / mmX
    const h = 50 / mmY
    const [p] = computeSidePlacements(
      design([{ customizerId: "a", left: W / 2, top: 130 + 40 / mmY + h / 2, width: w, height: h }])
    )
    expect(p).toEqual({ side: "front", widthMm: 100, heightMm: 50, fromTopMm: 40, offsetXMm: 0 })
    expect(formatPlacement(p)).toBe("100 × 50 mm · 40 mm below top of print zone · centred")
  })

  it("applies scale and reports a left-chest offset", () => {
    const [p] = computeSidePlacements(
      design([
        { customizerId: "a", left: W / 2 - 60 / mmX, top: 300, width: 20 / mmX, height: 20 / mmY, scaleX: 4, scaleY: 4 },
      ])
    )
    expect(p.widthMm).toBe(80)
    expect(p.offsetXMm).toBe(-60)
    expect(formatPlacement(p)).toContain("60 mm left of centre (as viewed)")
  })

  it("boxes every piece of artwork on a side together", () => {
    const [p] = computeSidePlacements(
      design([
        { customizerId: "a", left: 400, top: 300, width: 100, height: 100, originX: "left", originY: "top" },
        { customizerId: "b", left: 600, top: 300, width: 100, height: 100, originX: "left", originY: "top" },
      ])
    )
    expect(p.widthMm).toBe(Math.round(300 * mmX))
  })

  it("leaves out the print-zone distance for sleeves", () => {
    const [p] = computeSidePlacements(
      design([{ customizerId: "a", left: W / 2, top: 300, width: 100, height: 100 }], "left_sleeve")
    )
    expect(formatPlacement(p)).not.toContain("print zone")
  })

  it("returns nothing without a print area or size", () => {
    expect(computeSidePlacements({ sideLayouts: [] })).toEqual([])
    expect(computeSidePlacements(null)).toEqual([])
  })
})

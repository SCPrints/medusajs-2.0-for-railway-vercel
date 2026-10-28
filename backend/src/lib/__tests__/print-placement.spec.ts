import { computeSidePlacements, formatPlacement } from "../print-placement"

// A 1000×1250 (4:5, like every Studio frame) canvas with the A4 print area,
// built the way the storefront's getPrintArea does.
const W = 1000
const H = W * 1.25
const areaW = W * 0.68 * (14 / 38)
const areaH = H * 0.72 * (20 / 48)
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
    // below the zone top (13% of the canvas height).
    const w = 100 / mmX
    const h = 50 / mmY
    const [p] = computeSidePlacements(
      design([{ customizerId: "a", left: W / 2, top: H * 0.13 + 40 / mmY + h / 2, width: w, height: h }])
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

  it("measures the same when the stored print area belongs to another side's size", () => {
    // Front A3 + back Oversize: the design stores the OVERSIZE print area but
    // scpPrintSizeId says A3. Scale comes from the canvas, so nothing changes.
    const oversize = { x: (W - W * 0.68) / 2, y: H * 0.13, width: W * 0.68, height: H * 0.72 }
    const logo = { customizerId: "a", left: W / 2, top: H * 0.13 + 40 / mmY + 25 / mmY, width: 100 / mmX, height: 50 / mmY }
    const [p] = computeSidePlacements({ scpPrintSizeId: "up_to_a3", printArea: oversize, sideLayouts: [{ side: "front", objects: [logo] }] })
    expect(p).toMatchObject({ widthMm: 100, heightMm: 50, fromTopMm: 40, offsetXMm: 0 })
  })

  it("prefers the saved canvas size when the design has one", () => {
    const logo = { customizerId: "a", left: 400, top: 500, width: 100, height: 100 }
    const [withCanvas] = computeSidePlacements({ canvas: { width: 800, height: 1000 }, printArea: { x: 0, width: 1 }, sideLayouts: [{ side: "front", objects: [logo] }] })
    expect(withCanvas.offsetXMm).toBe(0)
    expect(withCanvas.widthMm).toBe(Math.round((100 * 380) / (800 * 0.68)))
  })
})

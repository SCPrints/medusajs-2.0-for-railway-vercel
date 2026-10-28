import {
  FRAME_ASPECT,
  getPrintArea,
  mockupViewportTransform,
  mockupVisibleRect,
  PRINT_SIZE_REF_CM,
  savedCanvasSize,
} from "./print-geometry"

describe("getPrintArea", () => {
  it("oversize fills 68% × 72% of the canvas, centred, 13% from the top", () => {
    const a = getPrintArea(600, 750, "oversize")
    expect(a.width).toBeCloseTo(408)
    expect(a.height).toBeCloseTo(540)
    expect(a.x).toBeCloseTo(96)
    expect(a.y).toBeCloseTo(97.5)
  })

  it("smaller sizes scale off oversize and sit lower", () => {
    const a6 = getPrintArea(600, 750, "up_to_a6")
    expect(a6.width).toBeCloseTo(600 * 0.68 * (PRINT_SIZE_REF_CM.up_to_a6.width / 38))
    expect(a6.y).toBeGreaterThan(getPrintArea(600, 750, "oversize").y)
  })
})

describe("savedCanvasSize", () => {
  it("uses the saved canvas when present", () => {
    expect(savedCanvasSize({ canvas: { width: 512, height: 640 }, printArea: { x: 1, y: 1, width: 1, height: 1 } })).toEqual({
      width: 512,
      height: 640,
    })
  })

  it("recovers older designs from the print-area width on the 4:5 frame", () => {
    const pa = getPrintArea(561, 561 * FRAME_ASPECT, "up_to_a3")
    expect(savedCanvasSize({ printArea: pa })).toEqual({ width: 561, height: 561 * FRAME_ASPECT })
  })

  it("is right even when the stored print area belongs to another side's size (past-design-02)", () => {
    // Front A3 + back Oversize stored the OVERSIZE print area; the old rule
    // read it with the A3 ratio and got a canvas ~1.78× too tall.
    const pa = getPrintArea(561, 701.25, "oversize")
    expect(savedCanvasSize({ printArea: pa })!.height).toBeCloseTo(701.25)
  })

  it("returns null when nothing usable is stored", () => {
    expect(savedCanvasSize({})).toBeNull()
  })
})

describe("mockup zoom", () => {
  it("visible rect is the canvas at scale 1 and maps onto the frame otherwise", () => {
    expect(mockupVisibleRect(600, 750, 1)).toEqual({ x: 0, y: 0, width: 600, height: 750 })
    const [s, , , , tx, ty] = mockupViewportTransform(600, 750, 0.68)
    const r = mockupVisibleRect(600, 750, 0.68)
    expect(s * r.x + tx).toBeCloseTo(0)
    expect(s * (r.y + r.height) + ty).toBeCloseTo(750)
  })
})

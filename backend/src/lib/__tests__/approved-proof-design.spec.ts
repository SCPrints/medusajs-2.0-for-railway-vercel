import { designCanvasSize, mergeApprovedProofs } from "../approved-proof-design"

const design = () => ({
  version: 3,
  canvas: { width: 400, height: 500 },
  printArea: { x: 100, y: 100, width: 200, height: 250 },
  sideLayouts: [
    { side: "front", objects: [{ type: "image", src: "old-front.png", left: 10, top: 20, scaleX: 1, scaleY: 1 }] },
    { side: "back", objects: [{ type: "image", src: "old-back.png", left: 5, top: 5 }] },
  ],
})

const proof = (over: Record<string, unknown>) => ({
  id: "p1",
  line_item_id: "li_1",
  side: "front",
  url: "https://cdn/mockup.jpg",
  uploaded_at: "2026-11-01T00:00:00.000Z",
  design: {
    objects: [{ type: "image", src: "fixed.png", left: 100, top: 200, scaleX: 0.5, scaleY: 0.5 }],
    canvas: { width: 800, height: 1000 },
    print_size_id: "up_to_a4",
  },
  ...over,
})

describe("mergeApprovedProofs", () => {
  it("swaps the proofed side, rescaled from the proof canvas, and leaves the rest", () => {
    const input = design()
    const { design: out, replacedSides, appliedProofs } = mergeApprovedProofs(input, [proof({})], "li_1")
    expect(replacedSides).toEqual(["front"])
    expect(appliedProofs).toEqual([{ side: "front", proof_id: "p1", url: "https://cdn/mockup.jpg", artwork_url: null }])
    expect(out.sideLayouts[0].objects).toEqual([
      { type: "image", src: "fixed.png", left: 50, top: 100, scaleX: 0.25, scaleY: 0.25 },
    ])
    expect(out.sideLayouts[1]).toEqual(input.sideLayouts[1])
    expect((out as any).approvedPrintSizeBySide).toEqual({ front: "up_to_a4" })
    expect(out.canvas).toEqual({ width: 400, height: 500 })
    // input untouched
    expect(input.sideLayouts[0].objects[0].src).toBe("old-front.png")
  })

  it("uses the newest proof with a design per side, ignoring other lines and design-less proofs", () => {
    const proofs = [
      proof({ id: "old", design: { ...proof({}).design, objects: [{ src: "older.png" }] } }),
      proof({ id: "new", uploaded_at: "2026-11-05T00:00:00.000Z", design: { ...proof({}).design, objects: [{ src: "newest.png" }] } }),
      proof({ id: "flat", uploaded_at: "2026-11-09T00:00:00.000Z", design: null }),
      proof({ id: "other", line_item_id: "li_2", uploaded_at: "2026-11-10T00:00:00.000Z" }),
    ]
    const { design: out } = mergeApprovedProofs(design(), proofs, "li_1")
    expect(out.sideLayouts[0].objects).toEqual([{ src: "newest.png" }])
  })

  it("adds a side the design didn't have", () => {
    const { design: out, replacedSides } = mergeApprovedProofs(design(), [proof({ side: "left_sleeve" })], "li_1")
    expect(replacedSides).toEqual(["left_sleeve"])
    expect(out.sideLayouts.map((l: any) => l.side)).toEqual(["front", "back", "left_sleeve"])
  })

  it("derives the design canvas from printArea on the 4:5 frame when canvas is missing", () => {
    const { canvas: _c, ...noCanvas } = design()
    expect(designCanvasSize(noCanvas)).toEqual({ width: 400, height: 500 })
    const { design: out } = mergeApprovedProofs(noCanvas, [proof({})], "li_1")
    expect(out.sideLayouts[0].objects[0]).toMatchObject({ left: 50, top: 100 })
    expect((out as any).canvas).toBeUndefined()
  })

  it("keeps proof coordinates when no design canvas can be derived", () => {
    const { canvas: _c, printArea: _p, ...bare } = design()
    const { design: out } = mergeApprovedProofs(bare, [proof({})], "li_1")
    expect(out.sideLayouts[0].objects[0]).toMatchObject({ left: 100, top: 200, scaleX: 0.5 })
  })

  it("is a no-op without matching proofs or a design", () => {
    const input = design()
    expect(mergeApprovedProofs(input, [], "li_1")).toEqual({ design: input, replacedSides: [], appliedProofs: [] })
    expect(mergeApprovedProofs(input, undefined, "li_1").replacedSides).toEqual([])
    expect(mergeApprovedProofs(null, [proof({})], "li_1")).toEqual({ design: null, replacedSides: [], appliedProofs: [] })
  })
})

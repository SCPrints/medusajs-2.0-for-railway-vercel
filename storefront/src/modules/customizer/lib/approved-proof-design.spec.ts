import { mergeApprovedProofs } from "./approved-proof-design"
import type { CustomizerMetadata } from "./types"

const base = {
  canvas: { width: 400, height: 500 },
  sideLayouts: [
    { side: "front", objects: [{ src: "old-front", left: 10, top: 10, scaleX: 1, scaleY: 1 }] },
    { side: "back", objects: [{ src: "old-back" }] },
  ],
  prints: [{ objectId: "a", side: "front", sizeId: "up_to_a6", manualSize: true, approxCm: { width: 1, height: 1 } }],
} as unknown as CustomizerMetadata

const proof = (over: Record<string, unknown>) => ({
  line_item_id: "li_1",
  side: "front",
  uploaded_at: "2026-11-01T00:00:00Z",
  design: { objects: [{ src: "new", left: 20, top: 40, scaleX: 2, scaleY: 2 }], canvas: { width: 200, height: 250 } },
  ...over,
})

describe("mergeApprovedProofs", () => {
  it("leaves the design alone without proof designs", () => {
    const r = mergeApprovedProofs(base, [proof({ design: null }), proof({ line_item_id: "other" })], "li_1")
    expect(r.replacedSides).toEqual([])
    expect(r.design).toBe(base)
  })

  it("replaces the side with the newest proof, rescaled to the design canvas", () => {
    const r = mergeApprovedProofs(
      base,
      [
        proof({ uploaded_at: "2026-11-02T00:00:00Z", design: { objects: [{ src: "newest", left: 20, top: 40, scaleX: 2, scaleY: 2 }], canvas: { width: 200, height: 250 }, print_size_id: "up_to_a3" } }),
        proof({}),
      ],
      "li_1"
    )
    expect(r.replacedSides).toEqual(["front"])
    const front = r.design.sideLayouts.find((s) => s.side === "front")!
    expect(front.objects).toEqual([{ src: "newest", left: 40, top: 80, scaleX: 4, scaleY: 4 }])
    expect(r.design.sideLayouts.find((s) => s.side === "back")!.objects).toEqual([{ src: "old-back" }])
    expect(r.design.prints![0]).toMatchObject({ sizeId: "up_to_a3", manualSize: false })
  })

  it("adds a side the original design did not have", () => {
    const r = mergeApprovedProofs(base, [proof({ side: "left_sleeve" })], "li_1")
    expect(r.design.sideLayouts.map((s) => s.side)).toEqual(["front", "back", "left_sleeve"])
  })
})

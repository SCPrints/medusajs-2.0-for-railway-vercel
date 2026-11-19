import { cleanPoNumber } from "../po-number"
import {
  buildReorderLineMetadata,
  classifyReorderLines,
  linePrintSizeId,
  setupFeesByGroup,
  type OrderLineLike,
} from "../reorder-lines"
import { allowlistClientLineMetadata } from "../client-line-metadata"

const studio = (id: string, over: Partial<OrderLineLike> = {}): OrderLineLike => ({
  id,
  product_title: "Staple Tee",
  variant_title: "Black / L",
  variant_id: "variant_1",
  quantity: 10,
  metadata: {
    customizerDesign: {
      group_id: "g_old",
      scpPrintSizeId: "up_to_a4",
      artifacts: [{ side: "front", printUrl: "p.png", mockupUrl: "old.jpg" }],
      pricing: { client: 1, server: { unit_price_major: 20 } },
    },
    product_handle: "staple-tee",
  },
  ...over,
})

describe("classifyReorderLines", () => {
  it("copies studio lines, rebuilds fees, and sends the rest to staff", () => {
    const { design, needs_staff } = classifyReorderLines([
      studio("a"),
      studio("nosize", { variant_id: null }),
      { id: "fee", metadata: { screen_setup_for_order: true, screen_setup_for_group: "g_old" } },
      { id: "disc", metadata: { pos_line_kind: "discount" } },
      { id: "vec", title: "Vectorising", metadata: { vectorization_for_order: true } },
      { id: "emb", title: "Cap", metadata: { decorationDesign: { stitches: 5000 } } },
      { id: "blank", title: "Plain tee", metadata: {} },
    ])
    expect(design.map((l) => l.id)).toEqual(["a"])
    expect(needs_staff.map((n) => n.line_item_id)).toEqual(["nosize", "vec", "emb", "blank"])
  })

  it("honours line_ids", () => {
    const { design, needs_staff } = classifyReorderLines([studio("a"), studio("b")], ["b"])
    expect(design.map((l) => l.id)).toEqual(["b"])
    expect(needs_staff).toEqual([])
  })
})

describe("buildReorderLineMetadata", () => {
  it("writes a fresh-add shape with a new group, no server pricing, the proof mockup, and reorder_of", () => {
    const line = studio("a")
    const md: any = buildReorderLineMetadata({
      line,
      design: line.metadata!.customizerDesign,
      appliedProofs: [{ side: "front", proof_id: "p1", url: "proof.jpg", artwork_url: null }],
      groupId: "g_new",
      groupSize: 2,
      order: { id: "order_1", display_id: 42 },
    })
    expect(md.customizerDesign.group_id).toBe("g_new")
    expect(md.customizerDesign.group_size).toBe(2)
    expect(md.customizerDesign.variantId).toBe("variant_1")
    expect(md.customizerDesign.pricing).toEqual({ client: 1 })
    // The pre-correction print file is dropped (no approved artwork recorded).
    expect(md.customizerDesign.artifacts[0]).toEqual({ side: "front", mockupUrl: "proof.jpg", approvedProofId: "p1" })
    expect(md.reorder_of).toEqual({ order_id: "order_1", display_id: 42, line_item_id: "a" })
    expect(md.product_handle).toBe("staple-tee")
    // Survives the add route's trust boundary.
    expect(allowlistClientLineMetadata(md).dropped).toEqual([])
    expect(linePrintSizeId(line, line.metadata!.customizerDesign)).toBe("up_to_a4")
  })
})

describe("buildReorderLineMetadata print files", () => {
  it("prints a proofed side from the approved artwork, not the old file", () => {
    const line = studio("a")
    const md: any = buildReorderLineMetadata({
      line,
      design: line.metadata!.customizerDesign,
      appliedProofs: [{ side: "front", proof_id: "p1", url: "proof.jpg", artwork_url: "approved.png" }],
      groupId: "g",
      groupSize: 1,
      order: { id: "order_1", display_id: 42 },
    })
    expect(md.customizerDesign.artifacts[0]).toEqual({
      side: "front",
      printUrl: "approved.png",
      mockupUrl: "proof.jpg",
      approvedProofId: "p1",
    })
  })
})

describe("linePrintSizeId", () => {
  it("charges the approved proof size when staff made the print bigger", () => {
    const line = studio("a")
    const design = { ...line.metadata!.customizerDesign, approvedPrintSizeBySide: { front: "up_to_a3" } }
    expect(linePrintSizeId(line, design)).toBe("up_to_a3")
    expect(linePrintSizeId(line, { ...design, approvedPrintSizeBySide: { front: "up_to_a6" } })).toBe("up_to_a4")
  })
})

describe("setupFeesByGroup", () => {
  it("counts screens (max over the group) and Supacolour print sides", () => {
    const d = (screens: number[], printSides: string[] = [], card?: string) => ({
      screenBreakdown: screens.map((effectiveColours) => ({ effectiveColours })),
      printSides,
      metadata: { customizerDesign: { pricing: { server: { full_colour_card: card } } } },
    })
    expect(
      setupFeesByGroup([
        { group_id: "g1", descriptor: d([2, 1]) },
        { group_id: "g1", descriptor: d([3, 1]) }, // dark colourway: underbase
        { group_id: "g2", descriptor: d([], ["front", "back"], "supacolour") },
        { group_id: "g3", descriptor: d([], ["front"]) },
      ])
    ).toEqual([
      { group_id: "g1", screens: 4, supacolour_designs: 0 },
      { group_id: "g2", screens: 0, supacolour_designs: 2 },
      { group_id: "g3", screens: 0, supacolour_designs: 0 },
    ])
  })
})

describe("cleanPoNumber", () => {
  it("trims, strips invisible characters and caps at 60", () => {
    expect(cleanPoNumber("  PO​-1234\n ")).toBe("PO -1234")
    expect(cleanPoNumber("x".repeat(80))).toHaveLength(60)
    expect(cleanPoNumber("   ")).toBeNull()
    expect(cleanPoNumber(undefined)).toBeNull()
    expect(cleanPoNumber(4501)).toBe("4501")
  })
})

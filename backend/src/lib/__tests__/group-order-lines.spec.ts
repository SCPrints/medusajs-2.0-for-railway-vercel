import { matchSizeVariant, printSizeIdForDesign, rosterToDesignLines } from "../group-order-lines"
import { computeDecorationTotals } from "../scp-decoration-pricing"

const v = (id: string, colour: string, size: string) => ({
  id,
  title: `${colour} / ${size}`,
  options: [
    { value: colour, option: { title: "Colour" } },
    { value: size, option: { title: "Size" } },
  ],
})
const variants = [v("black_s", "Black", "S"), v("black_l", "Black", "L"), v("navy_l", "Navy", "L"), v("navy_xl", "Navy", "XL")]

const design = {
  type: "fabric_customizer",
  scpPrintSizeId: "up_to_a4",
  prints: [{ side: "front", sizeId: "up_to_a4" }],
  pricing: { server: { unit_price_major: 1 } },
  group_id: "old",
}

describe("group-order-lines", () => {
  it("matches sizes exactly — 'L' never matches 'Black / S'", () => {
    expect(matchSizeVariant(variants, "L")).toBe("black_l")
    expect(matchSizeVariant(variants, " xl ")).toBe("navy_xl")
    expect(matchSizeVariant(variants, "M")).toBeNull()
  })

  it("keeps to the organiser's colour", () => {
    expect(matchSizeVariant(variants, "L", "navy_xl")).toBe("navy_l")
    expect(matchSizeVariant(variants, "S", "navy_xl")).toBeNull()
  })

  it("aggregates per variant, keeps names, and prices decoration", () => {
    const { lines, skipped } = rosterToDesignLines({
      variants,
      baseVariantId: "black_s",
      participants: [
        { id: "p1", name: "Ann", size_label: "L", quantity: 1, player_number: "7" },
        { id: "p2", name: "Bo", size_label: "L", quantity: 2 },
        { id: "p3", name: "Cy", size_label: "XXL", quantity: 1 },
      ],
      design,
      groupOrderId: "go_1",
    })
    expect(skipped.map((s) => s.name)).toEqual(["Cy"])
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line).toMatchObject({ variant_id: "black_l", quantity: 3, print_size_id: "up_to_a4" })
    const meta = line.metadata as any
    expect(meta.group_order_participants.map((p: any) => [p.name, p.player_number])).toEqual([["Ann", "7"], ["Bo", null]])
    expect(meta.customizerDesign.pricing).toBeUndefined()
    expect(meta.customizerDesign.group_id).toBe("go_go_1")
    const totals = computeDecorationTotals({
      metadata: meta,
      printSizeId: line.print_size_id as any,
      printTierQuantity: 3,
      embroideryQuantity: 3,
      screenHeavyGarment: false,
    })
    expect(totals.printTotalMajor).toBeGreaterThan(0)
  })

  it("blank group orders stay plain garment lines", () => {
    const { lines } = rosterToDesignLines({
      variants,
      participants: [{ id: "p1", name: "Ann", size_label: "S", quantity: 1 }],
      design: null,
      groupOrderId: "go_1",
    })
    expect(lines[0].print_size_id).toBeNull()
    expect((lines[0].metadata as any).customizerDesign).toBeUndefined()
  })

  it("falls back to the largest print when scpPrintSizeId is missing", () => {
    expect(printSizeIdForDesign({ prints: [{ sizeId: "up_to_a6" }, { sizeId: "up_to_a3" }] })).toBe("up_to_a3")
    expect(printSizeIdForDesign({})).toBe("up_to_a6")
  })
})

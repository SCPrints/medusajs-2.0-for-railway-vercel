import {
  baseColourPhoto,
  matchSizeVariant,
  printSizeIdForDesign,
  rosterToDesignLines,
  sizesForBaseColour,
} from "../group-order-lines"
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

  it("offers only the base colour's sizes, in garment order", () => {
    const many = [v("w_xl", "White", "XL"), ...variants, v("w_s", "White", "S"), v("w_m", "White", "M")]
    expect(sizesForBaseColour(many, "w_m")).toEqual(["S", "M", "XL"])
    expect(sizesForBaseColour(many, "navy_xl")).toEqual(["L", "XL"])
    // No base colour: every size, still no colour names or "Colour / Size" titles.
    expect(sizesForBaseColour(many)).toEqual(["S", "M", "L", "XL"])
    expect(sizesForBaseColour([{ id: "one", title: "One Size" }])).toEqual(["One Size"])
  })

  it("pictures each line in its own colour, not the product's main photo", () => {
    const images = [
      "https://cdn/5001_STAPLE_TEE_NAVY_BACK__1.jpg",
      "https://cdn/5001_STAPLE_TEE_BLUE__2.jpg",
      "https://cdn/5001_STAPLE_TEE_NAVY__3.jpg",
    ]
    const roster = [
      { id: "p1", name: "Ann", size_label: "L", quantity: 1 },
      { id: "p2", name: "Bo", size_label: "XL", quantity: 1 },
    ]
    const { lines } = rosterToDesignLines({
      variants,
      baseVariantId: "navy_l",
      participants: roster,
      design,
      groupOrderId: "go_1",
      images,
    })
    expect(lines.map((l) => l.thumbnail)).toEqual([
      "https://cdn/5001_STAPLE_TEE_NAVY__3.jpg",
      "https://cdn/5001_STAPLE_TEE_NAVY__3.jpg",
    ])
    expect(lines.every((l) => (l.metadata as any).colour_thumbnail === true)).toBe(true)
    // No photo of that colour: no picture and no flag, so the cart falls back as before.
    const black = rosterToDesignLines({
      variants,
      baseVariantId: "black_s",
      participants: [roster[0]],
      design,
      groupOrderId: "go_1",
      images,
    }).lines[0]
    expect(black.thumbnail).toBeUndefined()
    expect((black.metadata as any).colour_thumbnail).toBeUndefined()
  })

  it("shows the organiser's colour on the share page", () => {
    const images = ["https://cdn/5001_STAPLE_TEE_BLUE__2.jpg", "https://cdn/5001_STAPLE_TEE_NAVY__3.jpg"]
    expect(baseColourPhoto(variants, "navy_xl", images)).toBe("https://cdn/5001_STAPLE_TEE_NAVY__3.jpg")
    expect(baseColourPhoto(variants, "black_s", images)).toBeNull()
    expect(baseColourPhoto(variants, null, images)).toBeNull()
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

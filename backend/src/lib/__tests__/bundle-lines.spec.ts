import {
  applyBundleDiscount,
  buildBundleLineMetadata,
  bundleDiscountByLine,
  resolvePrintPositions,
  sanitizePrintPositions,
} from "../bundle-lines"
import { computeDecorationTotals, embroideryDigitizingUnits } from "../scp-decoration-pricing"
import { recomputeScpCartPricingPure } from "../recompute-scp-cart-pricing"

const bundle = { id: "bndl_1", handle: "trade-pack", title: "Trade Pack" }
const polo = {
  id: "bndi_polo",
  product_handle: "syzmik-zh231",
  label: "Hi Vis Polo",
  decoration_type: "embroidery",
  print_positions: {
    positions: [
      { side: "front", method: "embroidery", stitch_count: 6000, width_mm: 90, height_mm: 60 },
      { side: "back", method: "print", size_id: "up_to_a3" },
    ],
  },
}
const cap = {
  id: "bndi_cap",
  product_handle: "as-colour-access-cap-1130",
  label: "Cap",
  decoration_type: "embroidery",
  print_positions: null,
}

const build = (item: typeof polo | typeof cap, artworkUrl: string | null = "https://cdn/logo.png") =>
  buildBundleLineMetadata({
    bundle,
    item,
    productHandle: item.product_handle,
    artworkUrl,
    notes: null,
    addToken: "tok",
  })

// Simulates the server block computeScpLineDescriptor stamps at add time.
const withServerBlock = (metadata: Record<string, unknown>, printSizeId: string) => ({
  ...metadata,
  customizerDesign: {
    ...(metadata.customizerDesign as object),
    pricing: { server: { print_size_id: printSizeId, garment_unit_major: 30 } },
  },
})

describe("bundle-lines", () => {
  it("prices both embroidery and print decoration (never garment-only)", () => {
    const { metadata, printSizeId } = build(polo)
    expect(printSizeId).toBe("up_to_a3")
    const totals = computeDecorationTotals({
      metadata,
      printSizeId: printSizeId!,
      printTierQuantity: 10,
      embroideryQuantity: 10,
      screenHeavyGarment: false,
    })
    expect(totals.embroiderySides).toEqual(["front"])
    expect(totals.printSides).toEqual(["back"])
    expect(totals.embroideryTotalMajor).toBeGreaterThan(0)
    expect(totals.printTotalMajor).toBeGreaterThan(0)
    expect(totals.unconfiguredEmbroiderySides).toEqual([])
  })

  it("legacy items without positions get a priced front decoration", () => {
    expect(resolvePrintPositions(cap)).toEqual([
      { side: "front", method: "embroidery", stitch_count: 4000, width_mm: 90, height_mm: 60 },
    ])
    expect(resolvePrintPositions({ ...cap, decoration_type: "none" })).toEqual([])
    const { printSizeId } = build({ ...cap, decoration_type: "none" } as typeof cap)
    expect(printSizeId).toBeNull()
  })

  it("shares one digitizing file across every embroidered item of a pack", () => {
    for (const artwork of ["https://cdn/logo.png", null]) {
      const a = embroideryDigitizingUnits(build(polo, artwork).metadata, "line_a")
      const b = embroideryDigitizingUnits(build(cap, artwork).metadata, "line_b")
      expect(a[0].key).toBe(b[0].key)
    }
  })

  it("drops malformed positions and duplicate sides", () => {
    expect(
      sanitizePrintPositions([
        { side: "front", method: "print", size_id: "up_to_a6" },
        { side: "front", method: "embroidery" },
        { side: "pocket", method: "print" },
        { side: "back", method: "screen" },
      ])
    ).toEqual([{ side: "front", method: "print", size_id: "up_to_a6" }])
  })

  it("discounts a pack only while every item is in the cart", () => {
    const defs = new Map([["bndl_1", { discountPct: 10, itemIds: ["bndi_polo", "bndi_cap"] }]])
    const line = (id: string, itemId: string) => ({
      id,
      metadata: { bundle_id: "bndl_1", bundle_item_id: itemId },
    })
    const full = bundleDiscountByLine([line("l1", "bndi_polo"), line("l2", "bndi_cap")], defs)
    expect(full.get("l1")).toBe(10)
    expect(full.get("l2")).toBe(10)
    const partial = bundleDiscountByLine([line("l1", "bndi_polo")], defs)
    expect(partial.size).toBe(0)
    // Forged metadata for an unknown bundle earns nothing.
    expect(bundleDiscountByLine([{ id: "x", metadata: { bundle_id: "nope", bundle_item_id: "a" } }], defs).size).toBe(0)
  })

  it("caps the discount and leaves undiscounted prices alone", () => {
    expect(applyBundleDiscount(100, 10)).toBe(90)
    expect(applyBundleDiscount(100, 90)).toBe(70)
    expect(applyBundleDiscount(100, undefined)).toBe(100)
  })

  it("recompute applies the pack discount to the full decorated price", () => {
    const { metadata, printSizeId } = build(polo)
    const lines = [
      { id: "l1", quantity: 10, unit_price: 0, metadata: withServerBlock(metadata, printSizeId!), variant: { metadata: null } },
    ]
    const full = recomputeScpCartPricingPure(lines).prices.get("l1")!
    const discounted = recomputeScpCartPricingPure(lines, null, new Map([["l1", 10]])).prices.get("l1")!
    expect(full).toBeGreaterThan(30)
    expect(discounted).toBeCloseTo(Math.round(full * 0.9 * 100) / 100, 2)
  })
})

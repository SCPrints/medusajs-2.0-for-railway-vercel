import {
  clusterDigitizingEntries,
  computeDecorationTotals,
  embroideryDigitizingUnits,
} from "../scp-decoration-pricing"
import { recomputeScpCartPricingPure } from "../recompute-scp-cart-pricing"

/**
 * Digitizing-per-file model: one $60 fee per distinct (artwork, size ±5%)
 * combination — shared across sides/lines carrying the same file, charged
 * again when the artwork is resized beyond the ~5% machine tolerance.
 */

const TIERS = {
  bulk_pricing: {
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: 30.8 },
      { min_quantity: 10, max_quantity: 19, amount: 27.72 },
      { min_quantity: 20, max_quantity: 49, amount: 26.18 },
      { min_quantity: 50, max_quantity: 99, amount: 24.64 },
      { min_quantity: 100, amount: 23.1 },
    ],
  },
}

const embMetadata = (opts: {
  sides: Array<{
    side: string
    src?: string
    stitchCount?: number
    widthMm?: number
    heightMm?: number
  }>
}) => ({
  customizerDesign: {
    prints: opts.sides.map((s) => ({ side: s.side, sizeId: "up_to_a6" })),
    sideDecorationMethods: Object.fromEntries(opts.sides.map((s) => [s.side, "embroidery"])),
    sideEmbroideryConfigs: Object.fromEntries(
      opts.sides.map((s) => [
        s.side,
        {
          stitchCount: s.stitchCount ?? 3000,
          includeDigitizingFee: true,
          widthMm: s.widthMm ?? 80,
          heightMm: s.heightMm ?? 80,
        },
      ])
    ),
    sideLayouts: opts.sides.map((s) => ({
      side: s.side,
      objects: s.src ? [{ type: "Image", src: s.src }] : [],
    })),
    pricing: {
      server: {
        print_size_id: "up_to_a6",
        decorated_side_keys: opts.sides.map((s) => s.side),
        garment_unit_major: 30.8,
      },
    },
  },
})

describe("embroideryDigitizingUnits / clusterDigitizingEntries", () => {
  it("same artwork at the same size on two sides = one file", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a" },
        { side: "back", src: "https://r2/logo-a" },
      ],
    })
    const entries = embroideryDigitizingUnits(meta, "line")
    const clusters = new Set(clusterDigitizingEntries(entries).values())
    expect(clusters.size).toBe(1)
  })

  it("same artwork resized within 5% still shares the file", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a", widthMm: 80, heightMm: 80 },
        { side: "back", src: "https://r2/logo-a", widthMm: 83, heightMm: 83 },
      ],
    })
    const clusters = new Set(
      clusterDigitizingEntries(embroideryDigitizingUnits(meta, "line")).values()
    )
    expect(clusters.size).toBe(1)
  })

  it("same artwork resized beyond 5% = a NEW file (8cm chest vs 25cm back)", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a", widthMm: 80, heightMm: 80 },
        { side: "back", src: "https://r2/logo-a", widthMm: 250, heightMm: 250 },
      ],
    })
    const clusters = new Set(
      clusterDigitizingEntries(embroideryDigitizingUnits(meta, "line")).values()
    )
    expect(clusters.size).toBe(2)
  })

  it("different artwork = different files even at the same size", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a" },
        { side: "back", src: "https://r2/logo-b" },
      ],
    })
    const clusters = new Set(
      clusterDigitizingEntries(embroideryDigitizingUnits(meta, "line")).values()
    )
    expect(clusters.size).toBe(2)
  })

  it("unfingerprintable sides never merge across scopes", () => {
    const a = embroideryDigitizingUnits(embMetadata({ sides: [{ side: "front" }] }), "line_1")
    const b = embroideryDigitizingUnits(embMetadata({ sides: [{ side: "front" }] }), "line_2")
    const clusters = new Set(clusterDigitizingEntries([...a, ...b]).values())
    expect(clusters.size).toBe(2)
  })
})

describe("computeDecorationTotals digitizing attribution", () => {
  it("charges one fee for two sides sharing a file; amortises over quantity", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a" },
        { side: "back", src: "https://r2/logo-a" },
      ],
    })
    const totals = computeDecorationTotals({
      metadata: meta,
      printSizeId: "up_to_a6",
      printTierQuantity: 6,
      embroideryQuantity: 6,
      screenHeavyGarment: false,
    })
    // 3000st @ 1-25 = $10.50/side decoration; ONE $60 fee over 6 units = $10
    expect(totals.embroideryTotalMajor).toBeCloseTo(10.5 + 10 + 10.5, 2)
    const fees = totals.embroideryBreakdown.map((b) => b.digitizingFeeMajor)
    expect(fees.filter((f) => f === 60)).toHaveLength(1)
    expect(fees.filter((f) => f === 0)).toHaveLength(1)
  })

  it("charges two fees when the back is a >5% resize of the front", () => {
    const meta = embMetadata({
      sides: [
        { side: "front", src: "https://r2/logo-a", widthMm: 80, heightMm: 80 },
        { side: "back", src: "https://r2/logo-a", widthMm: 250, heightMm: 250 },
      ],
    })
    const totals = computeDecorationTotals({
      metadata: meta,
      printSizeId: "up_to_a6",
      printTierQuantity: 6,
      embroideryQuantity: 6,
      screenHeavyGarment: false,
    })
    expect(
      totals.embroideryBreakdown.filter((b) => b.digitizingFeeMajor === 60)
    ).toHaveLength(2)
  })
})

describe("recompute cart-wide digitizing amortisation", () => {
  const fanOutLine = (id: string, quantity: number) => ({
    id,
    quantity,
    unit_price: 999,
    variant: { id: "var_1", metadata: TIERS },
    metadata: embMetadata({ sides: [{ side: "front", src: "https://r2/logo-a" }] }),
  })

  it("one file across a 3-line size fan-out: fee amortised over the group total", () => {
    // 2 + 3 + 5 = 10 garments sharing one file → fee share $6/garment.
    // Garment @ aggregated qty 10 → $27.72; decoration $10.50.
    const result = recomputeScpCartPricingPure([
      fanOutLine("l1", 2),
      fanOutLine("l2", 3),
      fanOutLine("l3", 5),
    ])
    for (const id of ["l1", "l2", "l3"]) {
      expect(result.prices.get(id)).toBeCloseTo(27.72 + 10.5 + 6, 2)
    }
  })

  it("same artwork at a >5% different size on another garment pays its own fee", () => {
    const big = {
      id: "l_big",
      quantity: 5,
      unit_price: 999,
      variant: { id: "var_1", metadata: TIERS },
      metadata: embMetadata({
        sides: [{ side: "back", src: "https://r2/logo-a", widthMm: 250, heightMm: 250 }],
      }),
    }
    const result = recomputeScpCartPricingPure([fanOutLine("l_small", 5), big])
    // 10 garments aggregated → garment $27.72. Each size is its own file:
    // small: fee/5 = $12 ... big: fee/5 = $12.
    expect(result.prices.get("l_small")).toBeCloseTo(27.72 + 10.5 + 12, 2)
    expect(result.prices.get("l_big")).toBeCloseTo(27.72 + 10.5 + 12, 2)
  })

  it("same artwork at the same size on DIFFERENT garments shares one fee cart-wide", () => {
    const otherGarment = {
      id: "l_hoodie",
      quantity: 5,
      unit_price: 999,
      variant: { id: "var_2", metadata: TIERS },
      metadata: embMetadata({ sides: [{ side: "front", src: "https://r2/logo-a" }] }),
    }
    const result = recomputeScpCartPricingPure([fanOutLine("l_polo", 5), otherGarment])
    // One file across 10 garments → $6/garment fee share.
    expect(result.prices.get("l_polo")).toBeCloseTo(27.72 + 10.5 + 6, 2)
    expect(result.prices.get("l_hoodie")).toBeCloseTo(27.72 + 10.5 + 6, 2)
  })
})

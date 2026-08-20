import { evaluateCartPricing } from "../checkout-price-invariant"

// Repaired-DNC-style ladder: 1-9 $30.80 … 100+ $23.10 (cost $14 ex-GST).
const VARIANT_META = {
  cost_price_ex_gst_minor: 1400,
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

const embroideredLine = (unitPrice: number, overrides: Record<string, unknown> = {}) => ({
  id: "line_emb",
  quantity: 3,
  unit_price: unitPrice,
  variant_id: "var_1",
  variant: { id: "var_1", metadata: VARIANT_META },
  metadata: {
    customizerDesign: {
      artifacts: [{ side: "front", print_size_id: "up_to_a6" }],
      sideDecorationMethods: { front: "embroidery" },
      sideEmbroideryConfigs: { front: { stitchCount: 1760, includeDigitizingFee: true } },
      pricing: {
        server: {
          print_size_id: "up_to_a6",
          decorated_side_keys: ["front"],
          garment_unit_major: 30.8,
        },
      },
    },
    ...overrides,
  },
})

// Expected: garment 30.80 + embroidery (10.50 + 60/3) = 61.30
const CORRECT_EMB_UNIT = 61.3

describe("evaluateCartPricing", () => {
  it("passes a correctly priced cart", () => {
    const result = evaluateCartPricing([embroideredLine(CORRECT_EMB_UNIT)])
    expect(result.verdict).toBe("ok")
    expect(result.findings).toEqual([])
    expect(result.checked_lines).toBe(1)
  })

  it("ignores sub-50c rounding drift", () => {
    const result = evaluateCartPricing([embroideredLine(CORRECT_EMB_UNIT + 0.4)])
    expect(result.verdict).toBe("ok")
  })

  it("alerts on a small but non-trivial mismatch", () => {
    // 90c under: past the 50c ignore band, under max($1, 2%) = $1.23
    const result = evaluateCartPricing([embroideredLine(CORRECT_EMB_UNIT - 0.9)])
    expect(result.verdict).toBe("alert")
    expect(result.findings[0]).toMatchObject({ kind: "price_mismatch", severity: "alert" })
  })

  it("BLOCKS the order-#44 shape: embroidery charge silently dropped", () => {
    // What #44 actually charged: garment + bogus A6 print fee, no embroidery.
    const result = evaluateCartPricing([embroideredLine(39.3)])
    expect(result.verdict).toBe("block")
    const mismatch = result.findings.find((f) => f.kind === "price_mismatch")
    expect(mismatch).toMatchObject({ severity: "block", expected: CORRECT_EMB_UNIT })
  })

  it("blocks a material overcharge too", () => {
    const result = evaluateCartPricing([embroideredLine(CORRECT_EMB_UNIT + 25)])
    expect(result.verdict).toBe("block")
  })

  it("flags free decoration: decorated side with zero decoration charge", () => {
    const line = embroideredLine(30.8)
    ;(line.metadata.customizerDesign as any).sideEmbroideryConfigs = {} // config never committed
    const result = evaluateCartPricing([line])
    expect(result.findings.some((f) => f.kind === "free_decoration" && f.severity === "block")).toBe(
      true
    )
  })

  it("flags POA embroidery (over the stitch cap) reaching checkout", () => {
    const line = embroideredLine(30.8)
    ;(line.metadata.customizerDesign as any).sideEmbroideryConfigs = {
      front: { stitchCount: 15000 },
    }
    const result = evaluateCartPricing([line])
    expect(result.findings.some((f) => f.kind === "requires_quote")).toBe(true)
    expect(result.verdict).toBe("block")
  })

  it("flags a line priced below the garment's cash cost", () => {
    // $14 charged vs $15.40 cash cost — the DNC-inversion shape.
    const line = embroideredLine(14)
    const result = evaluateCartPricing([line])
    expect(result.findings.some((f) => f.kind === "below_cost")).toBe(true)
  })

  it("exempts quote-locked, embroidery-panel, and price-override lines", () => {
    const locked = { ...embroideredLine(5), id: "l1", metadata: { quote_locked_price: true } }
    const flowA = { ...embroideredLine(5), id: "l2", metadata: { decorationDesign: {} } }
    const override = {
      ...embroideredLine(5),
      id: "l3",
      metadata: {
        ...embroideredLine(5).metadata,
        price_override: { by: "sean@scprints.com.au", reason: "goodwill", at: "2026-08-21" },
      },
    }
    const result = evaluateCartPricing([locked, flowA, override])
    expect(result.verdict).toBe("ok")
    expect(result.checked_lines).toBe(0)
  })

  it("checks plain garment lines against the aggregated ladder", () => {
    const plain = {
      id: "line_plain",
      quantity: 10,
      unit_price: 27.72, // correct 10-19 tier
      variant_id: "var_1",
      variant: { id: "var_1", metadata: VARIANT_META },
      metadata: {},
    }
    expect(evaluateCartPricing([plain]).verdict).toBe("ok")
    expect(evaluateCartPricing([{ ...plain, unit_price: 17.5 }]).verdict).toBe("block")
  })
})

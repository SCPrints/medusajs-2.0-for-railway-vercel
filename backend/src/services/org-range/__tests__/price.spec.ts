import { buildRangeLines } from "../../../lib/org-range"
import { priceRangeLines } from "../index"

/**
 * The order form's price preview must be what the cart will charge: the same
 * descriptor as an add, then the cart's own re-pricing over the cart + the
 * new lines together (quantity breaks count every eligible line).
 */
const ladder = (base: number) => ({
  bulk_pricing: {
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: base },
      { min_quantity: 10, max_quantity: 19, amount: base - 2 },
      { min_quantity: 20, amount: base - 4 },
    ],
  },
})

const VARIANT_META: Record<string, Record<string, unknown>> = {
  v_m: ladder(20),
  v_l: ladder(20),
  v_cart: ladder(30),
}

const scope = {
  resolve: (_key: string) => ({
    graph: async (q: { entity: string; filters?: { id?: string | string[] } }) => {
      const ids = ([] as string[]).concat(q.filters?.id ?? [])
      if (q.entity === "variants") return { data: ids.map((id) => ({ id, metadata: VARIANT_META[id] ?? null })) }
      if (q.entity === "variant") return { data: ids.map((id) => ({ id, title: "White / M", product: { metadata: {} } })) }
      return { data: [] } // customer (no tier), products
    },
  }),
} as any

const lines = buildRangeLines({
  design: {
    id: "des_1",
    base_variant_id: "v_m",
    customizer_metadata: { prints: [{ side: "front", sizeId: "up_to_a4" }], scpPrintSizeId: "up_to_a4" },
  },
  product: { handle: "tee", title: "Tee", variants: [{ id: "v_m", title: "White / M" }, { id: "v_l", title: "White / L" }] },
  items: [
    { variant_id: "v_m", quantity: 6 },
    { variant_id: "v_l", quantity: 6 },
  ],
  groupId: "g1",
  organisationId: "org_1",
})

const cart = (items: any[] = []) => ({ id: "cart_1", customer_id: "cus_1", currency_code: "aud", items })

describe("priceRangeLines", () => {
  it("prices the form's lines together, not one by one", async () => {
    const out = await priceRangeLines(scope, cart(), lines)
    expect(out.total_quantity).toBe(12)
    expect(out.lines).toHaveLength(2)
    // 12 garments → the 10-19 garment price ($18) plus the print, same on both sizes.
    expect(out.lines[0].unit_price).toBe(out.lines[1].unit_price)
    expect(out.lines[0].unit_price).toBeGreaterThan(18)
    expect(out.total).toBeCloseTo(out.lines[0].unit_price * 12, 2)
    expect(out.setup_fees).toEqual([])

    // Six alone sit in the 1-9 band: dearer per garment than as part of twelve.
    const alone = await priceRangeLines(scope, cart(), [lines[0]])
    expect(alone.lines[0].unit_price).toBeGreaterThan(out.lines[0].unit_price)
  })

  it("counts what is already in the cart towards the quantity break", async () => {
    const empty = await priceRangeLines(scope, cart(), lines)
    const withCart = await priceRangeLines(
      scope,
      cart([{ id: "cali_1", quantity: 10, unit_price: 28, variant_id: "v_cart", metadata: null }]),
      lines
    )
    // 12 + 10 already in the cart = 22 → the 20+ band.
    expect(withCart.lines[0].unit_price).toBeLessThan(empty.lines[0].unit_price)
    expect(withCart.total_quantity).toBe(12)
  })
})

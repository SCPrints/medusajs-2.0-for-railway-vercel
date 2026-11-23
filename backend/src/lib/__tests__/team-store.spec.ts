import { evaluateCartPricing } from "../checkout-price-invariant"
import { stripServerTrustMetadata } from "../client-line-metadata"
import { deriveJobState } from "../job-state"
import { recomputeScpCartPricingPure } from "../recompute-scp-cart-pricing"
import { selectAcceptedWithoutOrder } from "../../services/attention/accepted-quotes"
import {
  buyerState,
  cartTeamStoreId,
  designMockups,
  isBulkTeamStoreCart,
  isUnderMinimum,
  itemVariants,
  runQuoteLines,
  storesDueToClose,
  storesDueToOpen,
  summariseRun,
  teamStoreCartMixError,
  variantItemError,
} from "../team-store"

// Ladder 1-9 $30.80 … 100+ $23.10 (cost $14 ex GST).
const VARIANT_META = {
  cost_price_ex_gst_minor: 1400,
  bulk_pricing: {
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: 30.8 },
      { min_quantity: 10, max_quantity: 19, amount: 27.72 },
      { min_quantity: 100, amount: 23.1 },
    ],
  },
}

const storeLine = (overrides: Record<string, unknown> = {}) => ({
  id: "line_ts",
  quantity: 1,
  unit_price: 25, // the store's price, under the qty-1 ladder price
  variant_id: "var_1",
  variant: { id: "var_1", metadata: VARIANT_META },
  metadata: {
    customizerDesign: {
      artifacts: [{ side: "front", print_size_id: "up_to_a4", mockupUrl: "https://r2/m.png", printUrl: "https://r2/p.png" }],
      pricing: { server: { print_size_id: "up_to_a4", decorated_side_keys: ["front"], garment_unit_major: 30.8 } },
    },
    team_store_id: "tstore_1",
    team_store_item_id: "tsitem_1",
    team_store_locked_price: true,
    ...overrides,
  },
})

describe("team-store price lock", () => {
  it("the cart recompute never re-prices a locked team-store line", () => {
    const { prices, excluded_line_ids } = recomputeScpCartPricingPure([storeLine() as any])
    expect(prices.has("line_ts")).toBe(false)
    expect(excluded_line_ids).toEqual(["line_ts"])
  })

  it("a qty-1 store line raises no checkout invariant finding", () => {
    const result = evaluateCartPricing([storeLine() as any])
    expect(result.verdict).toBe("ok")
    expect(result.findings).toEqual([])
    expect(result.checked_lines).toBe(0)
  })

  it("without the lock the same line would be re-priced (control)", () => {
    const { prices } = recomputeScpCartPricingPure([storeLine({ team_store_locked_price: undefined }) as any])
    expect(prices.has("line_ts")).toBe(true)
  })

  it("the core line-items routes strip forged team-store keys", () => {
    const out = stripServerTrustMetadata({
      team_store_locked_price: true,
      team_store_id: "tstore_1",
      team_store_item_id: "tsitem_1",
      team_store_delivery: "bulk",
      note: "keep",
    })!
    expect(out).toEqual({ note: "keep" })
  })
})

describe("team-store cart rules (Decision 4)", () => {
  const ts = (id: string) => ({ metadata: { team_store_id: id } })
  it("allows an empty cart or the same store", () => {
    expect(teamStoreCartMixError([], "tstore_1")).toBeNull()
    expect(teamStoreCartMixError([ts("tstore_1")], "tstore_1")).toBeNull()
  })
  it("refuses a cart with shop items or another store's items", () => {
    expect(teamStoreCartMixError([{ metadata: {} }], "tstore_1")).toMatch(/other products/)
    expect(teamStoreCartMixError([ts("tstore_2")], "tstore_1")).toMatch(/another team store/)
  })
  it("knows a team-store cart from its lines", () => {
    expect(cartTeamStoreId([{ metadata: null }, ts("tstore_9")])).toBe("tstore_9")
    expect(cartTeamStoreId([{ metadata: { team_store_id: "" } }])).toBeNull()
  })
  it("bulk delivery only when every line is a bulk store line", () => {
    expect(isBulkTeamStoreCart([{ metadata: { team_store_delivery: "bulk" } }])).toBe(true)
    expect(isBulkTeamStoreCart([{ metadata: { team_store_delivery: "bulk" } }, { metadata: {} }])).toBe(false)
    expect(isBulkTeamStoreCart([{ metadata: { team_store_delivery: "individual" } }])).toBe(false)
    expect(isBulkTeamStoreCart([])).toBe(false)
  })
})

describe("team-store variants", () => {
  const v = (id: string, colour: string, size: string, handle = "staple-tee") => ({
    id,
    title: `${colour} / ${size}`,
    product: { handle },
    options: [
      { value: colour, option: { title: "Colour" } },
      { value: size, option: { title: "Size" } },
    ],
  })
  const variants = [v("v_xl", "Black", "XL"), v("v_s", "Black", "S"), v("v_m", "Black", "M"), v("v_wm", "White", "M")]
  const item = { id: "tsitem_1", product_handle: "staple-tee", colour: "black", allowed_sizes: { sizes: ["S", "XL"] } }

  it("lists the item's colour and allowed sizes in size order", () => {
    expect(itemVariants(item, variants).map((x) => x.size)).toEqual(["S", "XL"])
    expect(itemVariants({ ...item, allowed_sizes: null }, variants).map((x) => x.id)).toEqual(["v_s", "v_m", "v_xl"])
  })
  it("rejects a variant from another garment, colour or a size not on sale", () => {
    expect(variantItemError(item, variants[1])).toBeNull()
    expect(variantItemError(item, v("v_o", "Black", "S", "other-tee"))).toMatch(/isn't part/)
    expect(variantItemError(item, variants[3])).toMatch(/colour/)
    expect(variantItemError(item, variants[2])).toMatch(/Size M/)
  })
  it("exposes mockups, never print files", () => {
    expect(designMockups(storeLine().metadata.customizerDesign)).toEqual(["https://r2/m.png"])
  })
})

describe("team-store open / close timing", () => {
  const now = new Date("2026-12-01T00:00:00Z")
  it("buyers see the grid only while open and inside the dates", () => {
    expect(buyerState({ status: "open", closes_at: "2026-12-05T00:00:00Z" }, now)).toBe("open")
    expect(buyerState({ status: "open", opens_at: "2026-12-02T00:00:00Z", closes_at: "2026-12-05T00:00:00Z" }, now)).toBe("not_yet_open")
    expect(buyerState({ status: "open", closes_at: "2026-11-30T00:00:00Z" }, now)).toBe("closed")
    expect(buyerState({ status: "in_production", closes_at: "2026-11-30T00:00:00Z" }, now)).toBe("closed")
  })
  it("closes open stores past their closing time only", () => {
    const due = storesDueToClose(
      [
        { id: "a", status: "open", closes_at: "2026-11-30T23:00:00Z" },
        { id: "b", status: "open", closes_at: "2026-12-02T00:00:00Z" },
        { id: "c", status: "closed", closes_at: "2026-11-01T00:00:00Z" },
      ],
      now
    )
    expect(due.map((s) => s.id)).toEqual(["a"])
  })
  it("opens approved stores at their opening time", () => {
    const due = storesDueToOpen(
      [
        { id: "a", status: "awaiting_approval", approved_at: "2026-11-20", opens_at: "2026-11-30T00:00:00Z", closes_at: "2026-12-09T00:00:00Z" },
        { id: "b", status: "awaiting_approval", approved_at: null, opens_at: "2026-11-30T00:00:00Z", closes_at: "2026-12-09T00:00:00Z" },
        { id: "c", status: "awaiting_approval", approved_at: "2026-11-20", opens_at: null, closes_at: "2026-12-09T00:00:00Z" },
      ],
      now
    )
    expect(due.map((s) => s.id)).toEqual(["a"])
  })
  it("under minimum only when a minimum is set", () => {
    expect(isUnderMinimum(24, 12)).toBe(true)
    expect(isUnderMinimum(24, 24)).toBe(false)
    expect(isUnderMinimum(null, 1)).toBe(false)
    expect(isUnderMinimum(0, 1)).toBe(false)
  })
})

describe("summariseRun", () => {
  const line = (item: string, size: string, qty: number, price = 30, store = "tstore_1") => ({
    quantity: qty,
    unit_price: price,
    title: "Staple Tee",
    metadata: { team_store_id: store, team_store_item_id: item, team_store_size: size, team_store_item_title: `Item ${item}` },
  })
  const orders = [
    { id: "o1", display_id: 1, status: "pending", name: "Sam", items: [line("i1", "M", 2), line("i1", "S", 1)] },
    { id: "o2", display_id: 2, status: "pending", name: "Alex", items: [line("i1", "M", 1), line("i2", "XL", 3, 40)] },
    { id: "o3", display_id: 3, status: "canceled", items: [line("i1", "M", 10)] },
    { id: "o4", display_id: 4, status: "pending", items: [line("i1", "M", 5, 30, "tstore_other")] },
  ]

  it("totals sizes across orders, excluding cancelled orders and other stores", () => {
    const s = summariseRun("tstore_1", orders)
    expect(s.order_ids).toEqual(["o1", "o2"])
    expect(s.units).toBe(7)
    expect(s.revenue).toBe(240) // 4 × $30 + 3 × $40
    expect(s.items.find((i) => i.item_id === "i1")!.sizes).toEqual([
      { size: "S", quantity: 1 },
      { size: "M", quantity: 3 },
    ])
    expect(s.buyers.map((b) => [b.name, b.units])).toEqual([["Sam", 3], ["Alex", 4]])
  })

  it("builds one run-quote line per item × size", () => {
    const lines = runQuoteLines(summariseRun("tstore_1", orders))
    expect(lines.map((l) => [l.title, l.quantity, l.total])).toEqual([
      ["Item i1 — S", 1, 30],
      ["Item i1 — M", 3, 90],
      ["Item i2 — XL", 3, 120],
    ])
  })
})

describe("the run in the Jobs read model", () => {
  const quote = {
    status: "accepted",
    created_at: "2026-12-01T00:00:00Z",
    quoted_at: null,
    accepted_at: "2026-12-01T00:00:00Z",
    has_prices: true,
    design_changes_requested_at: null,
    design_approved_at: null,
  }
  const base = { order: null, last_inbound_at: null, last_outbound_at: null, now: new Date("2026-12-02T00:00:00Z") }

  it("a run quote is never offered Convert to order", () => {
    expect(deriveJobState({ ...base, quote }).next_action.kind).toBe("convert_to_order")
    expect(deriveJobState({ ...base, quote: { ...quote, team_store_run: true } }).next_action.kind).toBe("run_team_store")
    expect(deriveJobState({ ...base, quote: { ...quote, team_store_run: true, team_store_done: true } }).next_action.kind).toBe("none")
  })

  it("the accepted-quote sweep skips run quotes", () => {
    const rows = [
      { id: "q1", status: "accepted", accepted_at: "2026-11-25T00:00:00Z", metadata: {} },
      { id: "q2", status: "accepted", accepted_at: "2026-11-25T00:00:00Z", metadata: { team_store_id: "tstore_1" } },
    ]
    expect(selectAcceptedWithoutOrder(rows, new Date("2026-12-01T00:00:00Z"))).toEqual(["q1"])
  })
})

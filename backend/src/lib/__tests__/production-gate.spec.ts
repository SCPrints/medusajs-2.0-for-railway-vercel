import { isDecoratedLine, productionGateFailures } from "../production-gate"

const ready = {
  meta: {},
  fromDownstream: "received" as const,
  toDownstream: "in_production" as const,
  artwork: "approved" as const,
  blanks: "arrived" as const,
  hasDecoratedLines: true,
}

describe("productionGateFailures", () => {
  it("passes a ready order", () => {
    expect(productionGateFailures(ready)).toEqual([])
  })

  it("lists every missing step", () => {
    expect(
      productionGateFailures({
        ...ready,
        artwork: "awaiting_approval",
        blanks: "ordered",
        meta: { deposit_amount_cents: 50000, deposit_paid: false },
      })
    ).toEqual(["Artwork isn't approved", "Blanks haven't arrived", "Deposit hasn't been paid"])
  })

  it("doesn't need artwork or blanks for an undecorated order", () => {
    expect(
      productionGateFailures({ ...ready, artwork: "pending", blanks: "not_started", hasDecoratedLines: false })
    ).toEqual([])
  })

  it("accepts a paid deposit", () => {
    expect(
      productionGateFailures({ ...ready, meta: { deposit_amount_cents: 50000, deposit_paid: true } })
    ).toEqual([])
  })

  it("only checks the move that starts production", () => {
    const notReady = { ...ready, artwork: "pending" as const }
    expect(productionGateFailures({ ...notReady, toDownstream: "shipped" })).toEqual([])
    expect(
      productionGateFailures({ ...notReady, fromDownstream: "in_production", toDownstream: "quality_check" })
    ).toEqual([])
  })
})

describe("isDecoratedLine", () => {
  it("spots customizer, decoration and POS customizer lines", () => {
    expect(isDecoratedLine({ metadata: { customizerDesign: { version: 2 } } })).toBe(true)
    expect(isDecoratedLine({ metadata: { decorationDesign: { method: "dtf" } } })).toBe(true)
    expect(isDecoratedLine({ metadata: { pos_line_kind: "customizer" } })).toBe(true)
    expect(isDecoratedLine({ metadata: { pos_line_kind: "standard" } })).toBe(false)
    expect(isDecoratedLine({ metadata: null })).toBe(false)
  })
})

import { getTierBySlug } from "../customer-tiers"
import { calculateEmbroideryUnitPriceMajor } from "../embroidery-pricing"
import { GARMENT_BREAKS, embroideryPriceTable, garmentBreakPrices, priceListCsvRows, printPriceTable, type PriceList } from "../price-list"
import { SCP_PRINT_UNIT_MATRIX } from "../scp-dtf-print-pricing"

const ladder = (amounts: number[]) => ({
  bulk_pricing: {
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: amounts[0] },
      { min_quantity: 10, max_quantity: 19, amount: amounts[1] },
      { min_quantity: 20, max_quantity: 49, amount: amounts[2] },
      { min_quantity: 50, max_quantity: 99, amount: amounts[3] },
      { min_quantity: 100, amount: amounts[4] },
    ],
  },
})

describe("garmentBreakPrices", () => {
  it("uses the quantity breaks the cart uses", () => {
    expect(GARMENT_BREAKS.map((b) => b.min_quantity)).toEqual([1, 10, 20, 50, 100])
    expect(GARMENT_BREAKS[0].label).toBe("1–9")
  })
  it("gives a low–high range per break across variants", () => {
    const prices = garmentBreakPrices([{ metadata: ladder([30, 20, 18, 16, 14]) }, { metadata: ladder([33, 23, 21, 19, 17]) }], null)
    expect(prices[0]).toEqual({ min: 30, max: 33 })
    expect(prices[4]).toEqual({ min: 14, max: 17 })
  })
  it("gives a tier customer their flat price at every break (string cost from SQL too)", () => {
    const gold = getTierBySlug("gold")!
    const prices = garmentBreakPrices([{ metadata: { ...ladder([30, 20, 18, 16, 14]), cost_price_ex_gst_minor: "1000" } }], gold)
    expect(prices).toEqual(GARMENT_BREAKS.map(() => ({ min: 14, max: 14 })))
  })
  it("falls back to the plain price, and is null when nothing is known", () => {
    expect(garmentBreakPrices([{ fallbackMajor: 25 }], null)[2]).toEqual({ min: 25, max: 25 })
    expect(garmentBreakPrices([{ metadata: {} }], null)).toEqual(GARMENT_BREAKS.map(() => null))
  })
})

describe("decoration tables come from the pricing code", () => {
  it("print table mirrors the DTF matrix", () => {
    const t = printPriceTable()
    expect(t.columns).toHaveLength(5)
    expect(t.rows.map((r) => r.prices)).toEqual(Object.values(SCP_PRINT_UNIT_MATRIX).map((r) => [...r]))
  })
  it("embroidery table matches the rate card at each band", () => {
    const t = embroideryPriceTable()
    expect(t.columns[0]).toBe("1–24")
    expect(t.columns[t.columns.length - 1]).toBe("500+")
    const row = t.rows.find((r) => r.label.includes("8,000"))!
    expect(row.prices[0]).toBe(calculateEmbroideryUnitPriceMajor({ stitchCount: 8000, quantity: 1, includeDigitizing: false }).unitDecorationMajor)
    expect(row.prices[t.columns.length - 1]).toBe(
      calculateEmbroideryUnitPriceMajor({ stitchCount: 8000, quantity: 500, includeDigitizing: false }).unitDecorationMajor
    )
    // 1,000–3,000 stitches share one price row.
    expect(t.rows[0].label).toBe("Up to 1,000 stitches")
    expect(t.rows[1].label).toBe("Up to 4,000 stitches")
  })
})

describe("priceListCsvRows", () => {
  it("writes garments then each decoration table", () => {
    const list: PriceList = {
      generated_at: "2026-11-19T00:00:00.000Z",
      currency_code: "aud",
      tier: null,
      breaks: GARMENT_BREAKS,
      garments: [{ product_id: "p", title: "Staple Tee", handle: "staple-tee", thumbnail: null, source: "ordered", prices: [{ min: 30, max: 33 }, null, null, null, { min: 14, max: 14 }] }],
      decoration: [printPriceTable()],
    }
    const rows = priceListCsvRows(list)
    expect(rows[0][0]).toContain("including GST")
    expect(rows[3]).toEqual(["Staple Tee", "30.00 - 33.00", "", "", "", "14.00"])
    expect(rows.some((r) => String(r[0]).startsWith("Up to A6"))).toBe(true)
  })

  it("dates the heading in Sydney time, not UTC", () => {
    // 8pm UTC on the 25th is 7am on the 26th in Sydney (AEDT), the date the page shows.
    const rows = priceListCsvRows({
      generated_at: "2026-11-25T20:00:00.000Z",
      currency_code: "aud",
      tier: null,
      breaks: GARMENT_BREAKS,
      garments: [],
      decoration: [],
    })
    expect(rows[0][0]).toContain("price list, 2026-11-26.")
  })
})

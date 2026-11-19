import { cartQuoteDoc } from "../cart-quote"

const base = {
  publicId: "Q-ABC123",
  issuedAt: new Date("2026-11-19T01:00:00Z"),
  currency: "aud",
  to: ["Riverside FC", "Jo Steele"],
  poNumber: "PO-77",
  lines: [
    { title: "Staple Tee — Black", description: null, sizes: "S 4 · M 10", quantity: 14, unit_price: 20, unit_price_max: 23, total: 289, thumbnail: null },
  ],
  decorations: [{ garment: "Staple Tee — Black", side: "front", side_label: "Front", method: "DTF print", detail: "approx. 20.0 × 25.0 cm" }],
  shipping: { name: "Standard Shipping (AU)", amount: 15 },
  discount: 0,
  total: 304,
  gst: 27.64,
}

describe("cartQuoteDoc", () => {
  it("is a formal quote: number, date, 30 days, PO, lines, shipping, GST included, total", () => {
    const doc = cartQuoteDoc(base)
    expect(doc.title).toBe("Quote")
    expect(doc.subtitle).toContain("Q-ABC123")
    expect(doc.subtitle).toContain("19 November 2026")
    expect(doc.facts).toEqual([
      ["Valid for", "30 days (until 19 December 2026)"],
      ["PO number", "PO-77"],
    ])
    expect(doc.tables[0].rows[0]).toEqual([
      "Staple Tee — Black\nFront: DTF print, approx. 20.0 × 25.0 cm",
      "S 4 · M 10",
      "14",
      "$20.00 – $23.00",
      "$289.00",
    ])
    expect(doc.totals).toEqual([
      { label: "Items", value: "$289.00" },
      { label: "Standard Shipping (AU)", value: "$15.00" },
      { label: "Total (inc GST)", value: "$304.00", bold: true },
      { label: "Includes GST of", value: "$27.64" },
    ])
  })
  it("says shipping is not included when none is chosen, and shows a discount", () => {
    const doc = cartQuoteDoc({ ...base, shipping: null, discount: 10, total: 279, poNumber: null })
    expect(doc.facts).toHaveLength(1)
    expect(doc.totals?.map((t) => t.label)).toEqual(["Items", "Discount", "Total (inc GST)", "Includes GST of"])
    expect(doc.notes?.some((n) => n.startsWith("Shipping is not included"))).toBe(true)
  })
})

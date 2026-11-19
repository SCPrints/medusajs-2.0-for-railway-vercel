import { customerQuoteStatus, customerQuoteSummary, ownsQuote, summariseQuoteLines } from "../customer-quotes"

const NOW = new Date("2026-11-19T00:00:00Z")

describe("customerQuoteStatus", () => {
  it.each([
    ["new", null, "waiting", "Waiting on us"],
    ["quoted", null, "ready", "Ready to accept"],
    ["quoted", "2026-12-01T00:00:00Z", "ready", "Ready to accept"],
    ["quoted", "2026-11-01T00:00:00Z", "expired", "Expired"],
    ["accepted", "2026-11-01T00:00:00Z", "accepted", "Accepted"],
    ["converted", null, "accepted", "Accepted"],
    ["expired", null, "expired", "Expired"],
    ["lost", null, "closed", "Closed"],
  ])("%s (expires %s) → %s", (status, expires_at, key, label) => {
    expect(customerQuoteStatus({ status, expires_at }, NOW)).toEqual({ key, label })
  })
})

describe("a quote downloaded from the cart", () => {
  const cartQuote = {
    id: "qt_c", public_id: "Q-CART", status: "new", total_estimate: 999,
    metadata: { cart_pdf: { total: 324, valid_until: "2026-12-19T00:00:00Z" }, staff_notified: false, job_pricer: { cost: 1 } },
  }
  const items = [{ title: "Staple Tee — Black / M", quantity: 10, unit_price: 26.5, total: 265 }]
  it("is 'From your cart' with the total and date the PDF gave, not 'Waiting on us'", () => {
    const s = customerQuoteSummary(cartQuote, items, NOW)
    expect(s).toMatchObject({ status: "cart", status_label: "From your cart", total: 324, expires_at: "2026-12-19T00:00:00.000Z", can_accept: false })
    expect(s.lines[0].unit_price).toBeNull()
  })
  it("becomes 'Waiting on us' once they ask us for a proof, and 'Expired' after the 30 days", () => {
    expect(customerQuoteStatus({ ...cartQuote, metadata: { ...cartQuote.metadata, staff_notified: true } }, NOW).key).toBe("waiting")
    expect(customerQuoteStatus(cartQuote, new Date("2027-01-01T00:00:00Z")).key).toBe("expired")
  })
})

describe("ownsQuote", () => {
  it("matches the customer id", () => {
    expect(ownsQuote({ customer_id: "cus_1", email: "x@y.com" }, "cus_1", null)).toBe(true)
  })
  it("matches the email, ignoring case and spaces", () => {
    expect(ownsQuote({ customer_id: null, email: " Jo@Club.com " }, "cus_1", "jo@club.com")).toBe(true)
  })
  it("refuses anyone else, and never matches two empty emails", () => {
    expect(ownsQuote({ customer_id: "cus_2", email: "a@b.com" }, "cus_1", "jo@club.com")).toBe(false)
    expect(ownsQuote({ customer_id: null, email: "" }, "cus_1", "")).toBe(false)
  })
})

const ITEMS = [
  { id: "1", title: "Staple Tee — Black / S", quantity: 4, unit_price: 20, total: 80, group_id: "g1", thumbnail: null },
  { id: "2", title: "Staple Tee — Black / M", quantity: 10, unit_price: 20, total: 200, group_id: "g1", thumbnail: "https://x/m.png" },
  { id: "3", title: "Staple Tee — Black / 3XL", quantity: 1, unit_price: 23, total: 23, group_id: "g1" },
  { id: "4", title: "Screen setup", description: "1 colour", quantity: 1, unit_price: 60, total: 60 },
]

describe("summariseQuoteLines", () => {
  it("folds sizes into one row per garment + colour", () => {
    const rows = summariseQuoteLines(ITEMS)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      title: "Staple Tee — Black",
      sizes: "S 4 · M 10 · 3XL 1",
      quantity: 15,
      unit_price: 20,
      unit_price_max: 23,
      total: 303,
      thumbnail: "https://x/m.png",
    })
    expect(rows[1]).toMatchObject({ title: "Screen setup", description: "1 colour", sizes: null, total: 60 })
  })
  it("hides every price when asked", () => {
    const rows = summariseQuoteLines(ITEMS, false)
    expect(rows.every((r) => r.unit_price === null && r.total === null)).toBe(true)
    expect(rows[0].quantity).toBe(15)
  })
  it("copes with junk", () => {
    expect(summariseQuoteLines(null)).toEqual([])
    expect(summariseQuoteLines([{}])[0]).toMatchObject({ title: "Item", quantity: 0 })
  })
})

describe("customerQuoteSummary", () => {
  const base = { id: "qt_1", public_id: "Q-ABC", currency_code: "aud", total_estimate: "363.00", created_at: "2026-11-10T00:00:00Z" }
  it("shows prices and Accept on a sent quote", () => {
    const s = customerQuoteSummary({ ...base, status: "quoted", expires_at: "2026-12-10T00:00:00Z" }, ITEMS, NOW)
    expect(s).toMatchObject({ status: "ready", status_label: "Ready to accept", total: 363, can_accept: true })
  })
  it("hides prices until we have sent it", () => {
    const s = customerQuoteSummary({ ...base, status: "new" }, ITEMS, NOW)
    expect(s.total).toBeNull()
    expect(s.can_accept).toBe(false)
    expect(s.lines[0].total).toBeNull()
  })
  it("never carries staff fields", () => {
    const s = customerQuoteSummary(
      { ...base, status: "quoted", assigned_to: "user_1", message: "internal", metadata: { job_pricer: { cost: 1 } }, email: "a@b.com" },
      [{ ...ITEMS[0], customizerDesign: { big: true }, variant_id: "v1" }],
      NOW
    )
    const json = JSON.stringify(s)
    for (const leak of ["assigned_to", "user_1", "internal", "job_pricer", "customizerDesign", "metadata"]) expect(json).not.toContain(leak)
  })
})

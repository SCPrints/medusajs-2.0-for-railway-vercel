import {
  accountDueDate,
  canApprove,
  canOrderForOrg,
  creditCheck,
  invoiceStatus,
  isSystemPaymentProvider,
  limitCheck,
  money,
  poCheck,
  summariseOrgOrders,
} from "../org-account"

const now = new Date("2026-11-20T02:00:00Z")

describe("org-account rules", () => {
  it("knows the no-card provider", () => {
    expect(isSystemPaymentProvider("pp_system_default")).toBe(true)
    expect(isSystemPaymentProvider("pp_stripe_stripe")).toBe(false)
    expect(isSystemPaymentProvider(undefined)).toBe(false)
  })

  it("reads bigNumber shapes", () => {
    expect(money("120.50")).toBe(120.5)
    expect(money({ value: "99" })).toBe(99)
    expect(money(null)).toBeNull()
    expect(money("abc")).toBeNull()
  })

  it("only owners and purchasers order for an organisation", () => {
    expect(canOrderForOrg("owner")).toBe(true)
    expect(canOrderForOrg("purchaser")).toBe(true)
    expect(canOrderForOrg("viewer")).toBe(false)
    expect(canOrderForOrg(null)).toBe(false)
  })

  it("due date is today plus the terms", () => {
    expect(accountDueDate(now, 30)).toBe("2026-12-20T02:00:00.000Z")
    expect(accountDueDate(now, 0)).toBe("2026-12-20T02:00:00.000Z")
  })

  it("credit limit counts what is already owing", () => {
    expect(creditCheck({ limit: null, outstanding: 9e6, total: 9e6 }).ok).toBe(true)
    expect(creditCheck({ limit: 1000, outstanding: 600, total: 400 })).toEqual({ ok: true, available: 400 })
    expect(creditCheck({ limit: 1000, outstanding: 600, total: 400.01 }).ok).toBe(false)
    expect(creditCheck({ limit: 1000, outstanding: 1500, total: 1 })).toEqual({ ok: false, available: 0 })
  })

  it("a blanket PO refuses when inactive, expired or short", () => {
    const po = { amount: 5000, is_active: true, expires_at: null, drawn: 4200, total: 800, now }
    expect(poCheck(po)).toEqual({ ok: true, remaining: 800 })
    expect(poCheck({ ...po, total: 800.5 })).toEqual({ ok: false, reason: "insufficient", remaining: 800 })
    expect(poCheck({ ...po, is_active: false })).toMatchObject({ ok: false, reason: "inactive" })
    expect(poCheck({ ...po, expires_at: "2026-11-19T00:00:00Z" })).toMatchObject({ ok: false, reason: "expired" })
    expect(poCheck({ ...po, expires_at: "2026-12-01T00:00:00Z" }).ok).toBe(true)
  })

  it("member limits: per order, then per month", () => {
    expect(limitCheck({ order_limit: null, monthly_limit: null, month_spend: 0, total: 1e6 })).toEqual({ ok: true })
    expect(limitCheck({ order_limit: 500, monthly_limit: null, month_spend: 0, total: 500 })).toEqual({ ok: true })
    expect(limitCheck({ order_limit: 500, monthly_limit: null, month_spend: 0, total: 501 })).toEqual({
      ok: false,
      reason: "order_limit",
      limit: 500,
    })
    expect(limitCheck({ order_limit: null, monthly_limit: 2000, month_spend: 1800, total: 300 })).toEqual({
      ok: false,
      reason: "monthly_limit",
      limit: 2000,
    })
  })

  it("owners approve, but not their own request unless they are the only owner", () => {
    expect(canApprove({ role: "purchaser", isRequester: false, ownerCount: 2 })).toBe(false)
    expect(canApprove({ role: "owner", isRequester: false, ownerCount: 2 })).toBe(true)
    expect(canApprove({ role: "owner", isRequester: true, ownerCount: 2 })).toBe(false)
    expect(canApprove({ role: "owner", isRequester: true, ownerCount: 1 })).toBe(true)
  })

  it("invoice status", () => {
    expect(invoiceStatus({ total: 100, paid: 100, due_at: "2020-01-01", now })).toBe("paid")
    expect(invoiceStatus({ total: 100, paid: 0, due_at: "2026-12-20T00:00:00Z", now })).toBe("outstanding")
    expect(invoiceStatus({ total: 100, paid: 40, due_at: "2026-11-01T00:00:00Z", now })).toBe("overdue")
    expect(invoiceStatus({ total: 100, paid: 0, due_at: null, now })).toBe("outstanding")
  })

  it("sums an organisation's orders", () => {
    const row = (o: Partial<Parameters<typeof summariseOrgOrders>[0][number]>) => ({
      id: "o",
      customer_id: "cus_a",
      created_at: "2026-11-05T00:00:00Z",
      canceled: false,
      total: 100,
      paid: 0,
      metadata: {},
      ...o,
    })
    const s = summariseOrgOrders(
      [
        row({ metadata: { account_terms: { days: 30 }, organisation_po_id: "po1" } }),
        row({ total: 250, paid: 250, metadata: { account_terms: { days: 30 }, organisation_po_id: "po1" } }),
        row({ total: 80, paid: 80, customer_id: "cus_b" }), // card order: never owing
        row({ total: 999, canceled: true, metadata: { account_terms: {}, organisation_po_id: "po1" } }),
        row({ total: 40, created_at: "2026-10-31T10:00:00Z" }), // last month in Sydney
      ],
      now
    )
    expect(s.outstanding).toBe(100)
    expect(s.po_drawn).toEqual({ po1: 350 })
    expect(s.month_spend).toEqual({ cus_a: 350, cus_b: 80 })
  })
})

jest.mock("@medusajs/medusa/core-flows", () => ({
  completeCartWorkflow: jest.fn(),
  createPaymentCollectionForCartWorkflow: jest.fn(),
  createPaymentSessionsWorkflow: jest.fn(),
}))
jest.mock("../../../modules/email-notifications/templates", () => ({
  EmailTemplates: { CUSTOMER_MESSAGE: "customer-message" },
}))

import { checkOrgCheckout } from "../index"

const now = new Date("2026-11-20T00:00:00Z")

type World = {
  cart: Record<string, any> | null
  member?: Record<string, any> | null
  org?: Record<string, any>
  orders?: any[]
  pos?: any[]
  centres?: any[]
  parked?: Record<string, any> | null
}

/** A container that answers from `world` and records what was written to the cart. */
function world(w: World) {
  const written: Record<string, unknown>[] = []
  const container = {
    resolve: (key: string) => {
      if (key === "query") {
        return {
          graph: async ({ entity }: { entity: string }) =>
            entity === "cart" ? { data: w.cart ? [w.cart] : [] } : { data: w.orders ?? [] },
        }
      }
      if (key === "cart") {
        return { updateCarts: async (_id: string, data: any) => void written.push(data.metadata) }
      }
      if (key === "organisation") {
        return {
          listOrganisationMembers: async () => (w.member ? [w.member] : []),
          retrieveOrganisation: async () => ({ id: "org_1", name: "Defence", account_terms_days: 30, ...w.org }),
          listOrganisationPurchaseOrders: async () => w.pos ?? [],
          listOrganisationCostCentres: async () => w.centres ?? [],
          listOrganisationCarts: async () => (w.parked ? [w.parked] : []),
        }
      }
      throw new Error(`unexpected resolve ${key}`)
    },
  } as any
  return { container, written }
}

const cart = (over: Record<string, any> = {}) => ({
  id: "cart_1",
  customer_id: "cus_buyer",
  completed_at: null,
  total: 500,
  metadata: { organisation_id: "org_1" },
  payment_collection: { payment_sessions: [{ provider_id: "pp_system_default" }] },
  ...over,
})
const card = { payment_collection: { payment_sessions: [{ provider_id: "pp_stripe_stripe" }] } }
const purchaser = { id: "orgm_1", role: "purchaser", order_limit: null, monthly_limit: null }
const run = (w: World, actorId: string | null = "cus_buyer", extra: Record<string, unknown> = {}) => {
  const { container, written } = world(w)
  return checkOrgCheckout(container, { cartId: "cart_1", actorId, now, ...extra }).then((result) => ({
    result,
    written,
  }))
}

describe("checkOrgCheckout — the no-card path", () => {
  it("refuses a personal cart", async () => {
    const { result } = await run({ cart: cart({ metadata: {} }) })
    expect(result).toMatchObject({ ok: false, status: 403, code: "account_terms_not_allowed" })
  })

  it("refuses a forged pay_on_account flag with no organisation", async () => {
    const { result } = await run({ cart: cart({ metadata: { pay_on_account: true, account_terms: { days: 999 } } }) })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it("refuses when the caller is a guest or not the cart's customer", async () => {
    const w = { cart: cart(), member: purchaser, org: { account_terms_enabled: true } }
    expect((await run(w, null)).result).toMatchObject({ ok: false, status: 403, code: "org_order_not_allowed" })
    expect((await run(w, "cus_other")).result).toMatchObject({ ok: false, status: 403 })
  })

  it("refuses a non-member and a viewer", async () => {
    const org = { account_terms_enabled: true }
    expect((await run({ cart: cart(), member: null, org })).result).toMatchObject({ ok: false, status: 403 })
    expect((await run({ cart: cart(), member: { ...purchaser, role: "viewer" }, org })).result).toMatchObject({
      ok: false,
      status: 403,
    })
  })

  it("refuses an organisation staff have not switched on", async () => {
    const { result, written } = await run({ cart: cart(), member: purchaser, org: { account_terms_enabled: false } })
    expect(result).toMatchObject({ ok: false, status: 403, code: "account_terms_not_allowed" })
    expect(written).toEqual([])
  })

  it("refuses over the credit limit, counting what is already owing", async () => {
    const { result } = await run({
      cart: cart(),
      member: purchaser,
      org: { account_terms_enabled: true, credit_limit: 1000 },
      orders: [
        { id: "o1", status: "pending", created_at: now, metadata: { account_terms: {} }, summary: { current_order_total: 700, paid_total: 0 } },
      ],
    })
    expect(result).toMatchObject({ ok: false, status: 409, code: "credit_limit" })
  })

  it("allows an approved organisation's purchaser and stamps the due date", async () => {
    const { result, written } = await run({
      cart: cart({ metadata: { organisation_id: "org_1", account_terms: { days: 999, due_at: "2099-01-01" } } }),
      member: purchaser,
      org: { account_terms_enabled: true, account_terms_days: 14 },
    })
    expect(result).toEqual({ ok: true, organisation_id: "org_1", on_account: true })
    expect(written[0]).toMatchObject({
      organisation_id: "org_1",
      pay_on_account: true,
      account_terms: { days: 14, due_at: "2026-12-04T00:00:00.000Z" },
      balance_due_at: "2026-12-04T00:00:00.000Z",
    })
  })

  it("checks only, without writing, when the payment session is created", async () => {
    const { result, written } = await run(
      { cart: cart({ ...card }), member: purchaser, org: { account_terms_enabled: true } },
      "cus_buyer",
      { forceAccount: true, stamp: false }
    )
    expect(result).toMatchObject({ ok: true, on_account: true })
    expect(written).toEqual([])
  })
})

describe("checkOrgCheckout — any organisation order", () => {
  it("strips on-account keys the browser put on a card order", async () => {
    const { result, written } = await run({
      cart: cart({ ...card, metadata: { organisation_id: "org_1", account_terms: { days: 1 }, balance_due_at: "x", po_number: "A1" } }),
      member: purchaser,
      org: { account_terms_enabled: true },
    })
    expect(result).toEqual({ ok: true, organisation_id: "org_1", on_account: false })
    expect(written[0]).toEqual({ organisation_id: "org_1", po_number: "A1" })
  })

  it("sends an order over the member's limit for approval, and lets an approved one through", async () => {
    const w = { cart: cart({ ...card }), member: { ...purchaser, order_limit: 200 }, org: {} }
    expect((await run(w)).result).toMatchObject({ ok: false, status: 409, code: "needs_approval" })
    const approved = { organisation_id: "org_1", status: "approved", approved_total: 500 }
    expect((await run({ ...w, parked: approved })).result).toMatchObject({ ok: true })
    // The cart grew after approval: back to needing approval.
    expect((await run({ ...w, parked: { ...approved, approved_total: 400 } })).result).toMatchObject({
      ok: false,
      code: "needs_approval",
    })
    expect((await run({ ...w, parked: { ...approved, status: "awaiting_approval" } })).result).toMatchObject({
      ok: false,
      code: "awaiting_approval",
    })
  })

  it("enforces the blanket PO balance and fills the PO number", async () => {
    const po = { id: "orgpo_1", number: "PO-77", amount: 600, expires_at: null, is_active: true }
    const w = {
      cart: cart({ ...card, metadata: { organisation_id: "org_1", organisation_po_id: "orgpo_1" } }),
      member: purchaser,
      pos: [po],
    }
    const ok = await run(w)
    expect(ok.result).toMatchObject({ ok: true })
    expect(ok.written[0]).toMatchObject({ organisation_po_id: "orgpo_1", po_number: "PO-77" })
    const drawn = [
      { id: "o1", status: "pending", created_at: now, metadata: { organisation_po_id: "orgpo_1" }, summary: { current_order_total: 200 } },
    ]
    expect((await run({ ...w, orders: drawn })).result).toMatchObject({ ok: false, status: 409, code: "po_insufficient" })
    expect((await run({ ...w, pos: [{ ...po, expires_at: "2026-01-01" }] })).result).toMatchObject({ code: "po_expired" })
    expect((await run({ ...w, pos: [] })).result).toMatchObject({ ok: false, status: 400, code: "po_not_found" })
  })

  it("needs a cost centre when the organisation keeps a list", async () => {
    const w = { cart: cart({ ...card }), member: purchaser, centres: [{ id: "c1", code: "OPS", name: "Ops", is_active: true }] }
    expect((await run(w)).result).toMatchObject({ ok: false, status: 400, code: "cost_centre_required" })
    const tagged = { ...w, cart: cart({ ...card, metadata: { organisation_id: "org_1", cost_centre: "OPS" } }) }
    expect((await run(tagged)).result).toMatchObject({ ok: true })
  })

  it("leaves a plain personal card order alone", async () => {
    const { result, written } = await run({ cart: cart({ ...card, metadata: { po_number: "X" } }) }, null)
    expect(result).toEqual({ ok: true, organisation_id: null, on_account: false })
    expect(written).toEqual([])
  })
})

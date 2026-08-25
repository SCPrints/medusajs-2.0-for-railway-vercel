// Replace the workflows with spies. Hoisted above the unit-under-test import.
const createOrderRun = jest.fn(async () => ({ result: { id: "order_new" } }))
const convertDraftRun = jest.fn(async () => ({ result: {} }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  createOrderWorkflow: jest.fn(() => ({ run: createOrderRun })),
  convertDraftOrderWorkflow: jest.fn(() => ({ run: convertDraftRun })),
}))
jest.mock("../../../lib/posthog", () => ({
  captureEvent: jest.fn(),
  getPostHog: () => null,
}))
jest.mock("../../../lib/audit-log", () => ({
  writeAudit: jest.fn(async () => undefined),
}))

import { convertQuoteToOrder } from "../convert"

const buildScope = (quote: Record<string, any>, opts?: {
  customer?: Record<string, any> | null
}) => {
  const quoteService = {
    retrieveQuote: jest.fn(async () => quote),
    updateQuotes: jest.fn(async () => [quote]),
    createQuoteEvents: jest.fn(async () => []),
  }
  const query = {
    graph: jest.fn(async ({ entity }: { entity: string }) => {
      if (entity === "region") {
        return { data: [{ id: "reg_au", currency_code: "aud" }] }
      }
      if (entity === "sales_channel") {
        return { data: [{ id: "sc_1", is_disabled: false }] }
      }
      if (entity === "customer") {
        return { data: opts?.customer ? [opts.customer] : [] }
      }
      if (entity === "order") {
        return { data: [{ id: "order_new", display_id: 99 }] }
      }
      if (entity === "product") {
        return {
          data: [
            {
              id: "prod_1",
              variants: [
                { id: "var_rank1", variant_rank: 1 },
                { id: "var_rank0", variant_rank: 0 },
              ],
            },
          ],
        }
      }
      return { data: [] }
    }),
  }
  return {
    resolve: (key: string) => {
      if (key === "quote") return quoteService
      if (key === "query") return query
      throw new Error(`unexpected resolve: ${key}`)
    },
    __quoteService: quoteService,
  } as any
}

const baseQuote = {
  id: "qt_1",
  public_id: "ABC123",
  status: "quoted",
  email: "accounts@school.nsw.edu.au",
  contact_name: "Jane Smith",
  company: "St Mary's",
  customer_id: null,
  currency_code: "aud",
  accepted_at: null,
  metadata: {},
  line_items: { items: [] as Array<Record<string, any>> },
}

beforeEach(() => {
  createOrderRun.mockClear()
  convertDraftRun.mockClear()
})

describe("convertQuoteToOrder", () => {
  it("converts lines honouring quoted price; null price falls back to catalog", async () => {
    const scope = buildScope({
      ...baseQuote,
      line_items: {
        items: [
          { variant_id: "var_a", quantity: 10, unit_price: 25.5, title: "Tee" },
          { variant_id: "var_b", quantity: 5, unit_price: null, title: "Hoodie" },
        ],
      },
    })
    const result = await convertQuoteToOrder(scope, { quoteId: "qt_1", actorId: "user_1" })
    expect(result.order_id).toBe("order_new")
    expect(result.lines_added).toBe(2)
    expect(convertDraftRun).toHaveBeenCalledTimes(1)

    const input = (createOrderRun.mock.calls[0] as any)[0].input
    expect(input.items[0]).toMatchObject({ unit_price: 25.5, quantity: 10 })
    expect(input.items[0].metadata.quote_locked_price).toBe(true)
    // null price → no unit_price key, so the line prices at catalog rate
    expect("unit_price" in input.items[1]).toBe(false)
    // billing identity overlaid from quote contact
    expect(input.billing_address.company).toBe("St Mary's")
    expect(input.billing_address.first_name).toBe("Jane")
  })

  it("resolves product-only lines, carries priced custom lines, skips unpriced", async () => {
    const scope = buildScope({
      ...baseQuote,
      line_items: {
        items: [
          { product_id: "prod_1", quantity: 3, unit_price: 20, title: "Polo" },
          { title: "Screen setup", quantity: 5, unit_price: 99 },
          { title: "No price yet", quantity: 1, unit_price: null },
        ],
      },
    })
    const result = await convertQuoteToOrder(scope, { quoteId: "qt_1", actorId: null })
    expect(result.lines_added).toBe(2)
    expect(result.skipped_items).toHaveLength(1)
    const input = (createOrderRun.mock.calls[0] as any)[0].input
    // lowest variant_rank wins
    expect(input.items[0].variant_id).toBe("var_rank0")
    // custom fee line converts variant-less at its quoted price
    expect(input.items[1]).toMatchObject({
      title: "Screen setup",
      quantity: 5,
      unit_price: 99,
    })
    expect(input.items[1].variant_id).toBeUndefined()
    expect(input.items[1].metadata.quote_custom_line).toBe(true)
  })

  it("stamps balance_due_at from the customer's payment terms", async () => {
    const scope = buildScope(
      {
        ...baseQuote,
        customer_id: "cus_1",
        line_items: { items: [{ variant_id: "var_a", quantity: 1, unit_price: 10 }] },
      },
      { customer: { id: "cus_1", metadata: { payment_terms_days: 14 }, addresses: [] } }
    )
    const before = Date.now()
    await convertQuoteToOrder(scope, { quoteId: "qt_1", actorId: null })
    const input = (createOrderRun.mock.calls[0] as any)[0].input
    const due = new Date(input.metadata.balance_due_at).getTime()
    expect(due).toBeGreaterThanOrEqual(before + 13.9 * 86_400_000)
    expect(due).toBeLessThanOrEqual(Date.now() + 14.1 * 86_400_000)
  })

  it("is idempotent when the quote already carries an order", async () => {
    const scope = buildScope({
      ...baseQuote,
      status: "accepted",
      metadata: { order_id: "order_prev", order_display_id: 42 },
    })
    const result = await convertQuoteToOrder(scope, { quoteId: "qt_1", actorId: null })
    expect(result).toMatchObject({ order_id: "order_prev", idempotent: true })
    expect(createOrderRun).not.toHaveBeenCalled()
  })

  it("refuses lost/expired quotes and quotes with no convertible lines", async () => {
    await expect(
      convertQuoteToOrder(buildScope({ ...baseQuote, status: "lost" }), {
        quoteId: "qt_1",
        actorId: null,
      })
    ).rejects.toThrow(/lost/)
    await expect(
      convertQuoteToOrder(buildScope({ ...baseQuote }), {
        quoteId: "qt_1",
        actorId: null,
      })
    ).rejects.toThrow(/no convertible line items/)
    expect(createOrderRun).not.toHaveBeenCalled()
  })
})

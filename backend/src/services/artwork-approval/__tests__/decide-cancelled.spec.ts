import { decideProof } from "../decide"
import { recordRequest } from "../../customer-portal/requests"

// The scope is never touched: both refuse before reading or writing anything.
const scope = {} as any

describe("cancelled orders", () => {
  it("refuses a proof answer after the order was cancelled", async () => {
    const order = { id: "order_1", status: "canceled", metadata: { artwork_stage: "awaiting_approval" } }
    const res = await decideProof(scope, order, { approved: true })
    expect(res).toMatchObject({ ok: false, httpStatus: 409, error: "order_cancelled" })
  })

  it("refuses a problem report or size swap on a cancelled order", async () => {
    const order = { id: "order_1", display_id: 1, customer_id: "c", email: null, currency_code: "aud", metadata: {}, items: [], canceled: true }
    await expect(
      recordRequest({ scope } as any, order, "c", { kind: "problem" } as any, { text: "", kind: "problem_reported", excerpt: "" })
    ).rejects.toThrow("This order was cancelled")
  })
})

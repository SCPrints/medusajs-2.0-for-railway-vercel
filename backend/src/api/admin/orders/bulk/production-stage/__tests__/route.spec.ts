import { Modules } from "@medusajs/framework/utils"

import { POST } from "../route"
import { ARTWORK_STAGE_EVENT } from "../../../../../../lib/production-stage"
import { mergeOrderMetadata } from "../../../../../../lib/order-metadata"

jest.mock("../../../../../../lib/posthog", () => ({ getPostHog: () => null }))
// The route writes through the atomic jsonb merge (review 3-5); the mock
// applies unset / patch / append to the in-memory fixture.
jest.mock("../../../../../../lib/order-metadata", () => ({
  mergeOrderMetadata: jest.fn(async () => {}),
}))
const merge = mergeOrderMetadata as jest.Mock

type AnyOrder = {
  id: string
  metadata?: Record<string, unknown>
  items?: { id: string; metadata?: Record<string, unknown> }[]
}

const buildScope = (orders: AnyOrder[]) => {
  const byId = new Map(orders.map((o) => [o.id, o]))
  merge.mockClear()
  merge.mockImplementation(
    async (
      _c: unknown,
      id: string,
      patch: Record<string, unknown>,
      o?: { unset?: string[]; append?: Record<string, unknown[]> }
    ) => {
      const order = byId.get(id)
      if (!order) throw new Error(`order ${id} not found`)
      const meta: Record<string, unknown> = { ...(order.metadata ?? {}) }
      for (const k of o?.unset ?? []) delete meta[k]
      Object.assign(meta, patch)
      for (const [k, entries] of Object.entries(o?.append ?? {})) {
        meta[k] = [...(Array.isArray(meta[k]) ? (meta[k] as unknown[]) : []), ...entries]
      }
      order.metadata = meta
    }
  )
  const orderModule = {
    retrieveOrder: jest.fn(async (id: string) => {
      const o = byId.get(id)
      if (!o) throw new Error(`order ${id} not found`)
      return { ...o }
    }),
    updateOrders: jest.fn(async (id: string, patch: { metadata: Record<string, unknown> }) => {
      byId.get(id)!.metadata = patch.metadata
      return [byId.get(id)]
    }),
  }
  const eventBus = { emit: jest.fn(async () => undefined) }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return {
    orderModule,
    eventBus,
    scope: {
      resolve: jest.fn((key: string | symbol) => {
        if (key === Modules.ORDER) return orderModule
        if (key === Modules.EVENT_BUS) return eventBus
        if (key === "logger") return logger
        throw new Error(`unexpected scope.resolve key: ${String(key)}`)
      }),
    },
  }
}

const buildRes = () => {
  const res: any = { statusCode: 200, body: undefined as unknown }
  res.json = jest.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  return res
}

const req = (scope: any, body: Record<string, unknown>) =>
  ({ scope, body, auth_context: { actor_id: "admin-user-1" } }) as any

describe("POST /admin/orders/bulk/production-stage — same-value check reads the track", () => {
  it("skips an order already awaiting approval even though production_stage holds the last (blanks) transition", async () => {
    const order: AnyOrder = {
      id: "order-1",
      metadata: {
        artwork_stage: "awaiting_approval",
        artwork_stage_changed_at: "2026-10-01T00:00:00.000Z",
        blanks_stage: "ordered",
        // The overloaded field: last transition on ANY track was blanks → ordered.
        production_stage: "ordered",
        production_stage_history: [
          { stage: "awaiting_approval", changed_at: "2026-10-01T00:00:00.000Z", track: "artwork" },
          { stage: "ordered", changed_at: "2026-10-02T00:00:00.000Z", track: "blanks" },
        ],
      },
    }
    const { scope, orderModule, eventBus } = buildScope([order])
    const res = buildRes()

    await POST(req(scope, { order_ids: ["order-1"], stage: "awaiting_approval" }), res)

    expect(res.body).toMatchObject({ changed: 0, skipped: 1, failed: 0 })
    expect(res.body.results[0]).toMatchObject({ order_id: "order-1", changed: false })
    // No duplicate history entry, no reset of the proof round, no second proof email.
    expect(merge).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(order.metadata?.artwork_stage_changed_at).toBe("2026-10-01T00:00:00.000Z")
    expect(order.metadata?.production_stage_history).toHaveLength(2)
  })

  it("moves an order whose artwork is in review to awaiting approval and emits the artwork event", async () => {
    const order: AnyOrder = {
      id: "order-2",
      metadata: { artwork_stage: "in_review", production_stage: "received" },
    }
    const { scope, orderModule, eventBus } = buildScope([order])
    const res = buildRes()

    await POST(req(scope, { order_ids: ["order-2"], stage: "awaiting_approval" }), res)

    expect(res.body).toMatchObject({ changed: 1, skipped: 0, failed: 0 })
    expect(res.body.results[0]).toMatchObject({
      changed: true,
      from_stage: "in_review",
      to_stage: "awaiting_approval",
    })
    expect(merge).toHaveBeenCalledTimes(1)
    expect(order.metadata?.artwork_stage).toBe("awaiting_approval")
    expect(eventBus.emit).toHaveBeenCalledWith({
      name: ARTWORK_STAGE_EVENT,
      data: expect.objectContaining({ from_stage: "in_review", to_stage: "awaiting_approval", track: "artwork" }),
    })
  })

  it("reports a skipped step as a failure instead of forcing it (bulk has no override)", async () => {
    const order: AnyOrder = { id: "order-3", metadata: { artwork_stage: "pending" } }
    const { scope, orderModule } = buildScope([order])
    const res = buildRes()

    await POST(req(scope, { order_ids: ["order-3"], stage: "approved" }), res)

    expect(res.body).toMatchObject({ changed: 0, failed: 1 })
    expect(res.body.results[0].error).toMatch(/pending → approved is not an allowed transition for bulk/)
    expect(merge).not.toHaveBeenCalled()
  })
})

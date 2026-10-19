import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { POST } from "../route"
import { POS_SESSION_MODULE } from "../../../../../../modules/pos-session"

const GARMENT_MAJOR = 20

const buildScope = (opts?: { queryBroken?: boolean }) => {
  const session: any = {
    id: "pos_1",
    status: "active",
    customer_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    items: [],
  }
  const posService = {
    retrievePosSession: jest.fn(async () => session),
    updatePosSessions: jest.fn(async (patch: any) => {
      session.items = patch.items
      return session
    }),
  }
  const query = {
    graph: jest.fn(async () => {
      if (opts?.queryBroken) throw new Error("db down")
      return {
        data: [
          {
            id: "variant_1",
            metadata: { bulk_pricing: { tiers: [{ min_quantity: 1, amount: GARMENT_MAJOR }] } },
            product: { metadata: {} },
          },
        ],
      }
    }),
  }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return {
    posService,
    logger,
    scope: {
      resolve: jest.fn((key: string | symbol) => {
        if (key === POS_SESSION_MODULE) return posService
        if (key === ContainerRegistrationKeys.QUERY) return query
        if (key === ContainerRegistrationKeys.LOGGER) return logger
        throw new Error(`unexpected scope.resolve key: ${String(key)}`)
      }),
    },
  }
}

const buildRes = () => {
  const res: any = { statusCode: 200, body: undefined }
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

const customizerBody = () => ({
  kind: "customizer",
  variant_id: "variant_1",
  product_id: "prod_1",
  product_title: "Staple Tee",
  quantity: 1,
  // What the bridge sends today: the bare garment price.
  unit_price_cents: GARMENT_MAJOR * 100,
  metadata: {
    print_size_id: "up_to_a3",
    customizerDesign: {
      artifacts: [{ side: "front", print_size_id: "up_to_a3" }],
    },
  },
})

describe("POST /store/pos-sessions/:id/items — customizer pricing", () => {
  it("prices an A3-printed line above the bare variant price", async () => {
    const { scope } = buildScope()
    const res = buildRes()
    await POST({ scope, params: { id: "pos_1" }, body: customizerBody() } as any, res)

    expect(res.statusCode).toBe(201)
    const item = res.body.item
    expect(item.unit_price_cents).toBeGreaterThan(GARMENT_MAJOR * 100)
    expect(item.metadata.customizerDesign.pricing.server.print_total_major_per_garment).toBeGreaterThan(0)
  })

  it("falls back to the client price and logs when derivation throws", async () => {
    const { scope, logger } = buildScope({ queryBroken: true })
    const res = buildRes()
    await POST({ scope, params: { id: "pos_1" }, body: customizerBody() } as any, res)

    expect(res.statusCode).toBe(201)
    expect(res.body.item.unit_price_cents).toBe(GARMENT_MAJOR * 100)
    expect(logger.warn).toHaveBeenCalled()
  })
})

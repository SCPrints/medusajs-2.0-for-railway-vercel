import { MedusaError } from "@medusajs/framework/utils"

import { POST } from "../route"
import { DESIGNS_MODULE } from "../../../../modules/designs"
import { GROUP_ORDER_MODULE } from "../../../../modules/group-order"

jest.mock("../../../../lib/posthog", () => ({ getPostHog: () => null }))

const DESIGNS: Record<string, { id: string; customer_id: string }> = {
  des_mine: { id: "des_mine", customer_id: "cus_me" },
  des_theirs: { id: "des_theirs", customer_id: "cus_other" },
}

function buildScope() {
  const groupOrders = {
    createGroupOrders: jest.fn(async (rows: Array<Record<string, unknown>>) =>
      rows.map((r) => ({ id: "go_1", ...r }))
    ),
  }
  const designs = {
    retrieveDesign: jest.fn(async (id: string) => {
      const d = DESIGNS[id]
      if (!d) throw new Error("not found")
      return d
    }),
  }
  return {
    groupOrders,
    designs,
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === GROUP_ORDER_MODULE) return groupOrders
        if (key === DESIGNS_MODULE) return designs
        throw new Error(`unexpected scope.resolve key: ${String(key)}`)
      }),
    },
  }
}

const buildReq = (scope: any, body: Record<string, unknown>, actorId?: string) =>
  ({
    scope,
    body,
    auth_context: actorId ? { actor_id: actorId } : undefined,
  }) as any

const buildRes = () => {
  const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) }
  return res
}

const baseBody = { title: "Team kit", owner_email: "coach@example.com", base_product_id: "prod_1" }

describe("POST /store/group-orders — base_design_id ownership", () => {
  it("creates the group order when the design belongs to the signed-in customer", async () => {
    const { scope, groupOrders } = buildScope()
    const res = buildRes()

    await POST(buildReq(scope, { ...baseBody, base_design_id: "des_mine" }, "cus_me"), res)

    expect(groupOrders.createGroupOrders).toHaveBeenCalledTimes(1)
    const [row] = groupOrders.createGroupOrders.mock.calls[0][0]
    expect(row).toMatchObject({ owner_customer_id: "cus_me", base_design_id: "des_mine" })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it("rejects another customer's design with 404 (not 403) and creates nothing", async () => {
    const { scope, groupOrders } = buildScope()

    await expect(
      POST(buildReq(scope, { ...baseBody, base_design_id: "des_theirs" }, "cus_me"), buildRes())
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND })
    expect(groupOrders.createGroupOrders).not.toHaveBeenCalled()
  })

  it("treats an unknown design id the same as someone else's", async () => {
    const { scope, groupOrders } = buildScope()

    await expect(
      POST(buildReq(scope, { ...baseBody, base_design_id: "des_nope" }, "cus_me"), buildRes())
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND })
    expect(groupOrders.createGroupOrders).not.toHaveBeenCalled()
  })

  it("requires a signed-in customer when a base_design_id is supplied", async () => {
    const { scope, groupOrders, designs } = buildScope()

    await expect(
      POST(buildReq(scope, { ...baseBody, base_design_id: "des_mine" }), buildRes())
    ).rejects.toMatchObject({ type: MedusaError.Types.UNAUTHORIZED })
    expect(designs.retrieveDesign).not.toHaveBeenCalled()
    expect(groupOrders.createGroupOrders).not.toHaveBeenCalled()
  })

  it("still allows a product-only group order without a design (existing behaviour)", async () => {
    const { scope, groupOrders, designs } = buildScope()
    const res = buildRes()

    await POST(buildReq(scope, baseBody, "cus_me"), res)

    expect(designs.retrieveDesign).not.toHaveBeenCalled()
    expect(groupOrders.createGroupOrders).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

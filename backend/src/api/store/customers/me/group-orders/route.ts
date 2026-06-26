import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { GROUP_ORDER_MODULE } from "../../../../../modules/group-order"
import type GroupOrderModuleService from "../../../../../modules/group-order/service"
import { requireCustomer } from "../../../../../lib/require-customer"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const service = req.scope.resolve<GroupOrderModuleService>(GROUP_ORDER_MODULE)
  const list = await service.listGroupOrders(
    { owner_customer_id: customerId },
    { order: { created_at: "DESC" }, take: 100 }
  )
  res.json({ group_orders: list })
}

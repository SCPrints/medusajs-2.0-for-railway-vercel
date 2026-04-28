import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { buildLineCustomizerExport } from "../../../../../lib/customizer-order-artifacts"

const paramsSchema = z.object({
  id: z.string().min(1),
})

/**
 * GET /admin/orders/:id/customizer-download
 *
 * Admin-authenticated JSON listing print file URLs and mockup preview URLs per line item,
 * sourced from `metadata.customizerDesign` saved at add-to-cart.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsedParams = paramsSchema.safeParse(req.params ?? {})
  if (!parsedParams.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid order id: ${parsedParams.error.message}`
    )
  }

  const orderId = parsedParams.data.id
  const orderModuleService = req.scope.resolve<IOrderModuleService>(Modules.ORDER)

  let order: Awaited<ReturnType<IOrderModuleService["retrieveOrder"]>>
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items"],
    })
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order "${orderId}" was not found.`)
  }

  type LineShape = Parameters<typeof buildLineCustomizerExport>[0]
  const rawItems = (order as { items?: LineShape[] }).items ?? []
  const lines = rawItems.map((line) => buildLineCustomizerExport(line))

  const displayId = (order as { display_id?: unknown }).display_id
  const display_id =
    typeof displayId === "number" ? displayId : typeof displayId === "string" ? displayId : null

  return res.status(200).json({
    order_id: order.id ?? orderId,
    display_id,
    lines,
  })
}

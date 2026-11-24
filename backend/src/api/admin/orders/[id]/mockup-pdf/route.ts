import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { generateMockupPdf, hasArtworkToApprove, type MockupOrder } from "../../../../../services/mockup-pdf/service"

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * GET /admin/orders/:id/mockup-pdf
 *
 * Generates and returns an artwork approval PDF for the order.
 * Each product in the order gets one page showing front/back mockups,
 * print dimensions, disclaimer, and size quantities.
 *
 * Query params:
 *   job_number  — optional override for the Job # shown in the header
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
  const jobNumberOverride =
    typeof req.query?.job_number === "string" && req.query.job_number.trim()
      ? req.query.job_number.trim()
      : undefined

  const orderModuleService = req.scope.resolve<IOrderModuleService>(Modules.ORDER)

  let order: MockupOrder
  try {
    const raw = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    })
    order = raw as unknown as MockupOrder
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order "${orderId}" was not found.`)
  }

  // A PDF with no pages is rejected by most viewers: say why instead. The PDF
  // pages come from Studio designs and revised proofs only (embroidery-only and
  // bundle lines carry no mockup to put on a page).
  const groups = new Map<string, Array<{ id: string; metadata?: Record<string, unknown> | null }>>()
  for (const it of (order as any).items ?? []) {
    const key = String(it.metadata?.customizerDesign?.group_id ?? it.product_id ?? it.id)
    groups.set(key, [...(groups.get(key) ?? []), it])
  }
  if (![...groups.values()].some((g) => hasArtworkToApprove(g, (order as any).metadata))) {
    return res.status(422).json({
      message: "Nothing to put in a mockup PDF: this order has no Studio designs or revised proofs. Create a revised proof on a line first.",
    })
  }

  const pdfBuffer = await generateMockupPdf(order, { jobNumberOverride })

  const displayId = order.display_id ?? orderId
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="artwork-approval-${displayId}.pdf"`
  )
  res.setHeader("Content-Length", pdfBuffer.length)
  res.status(200).send(pdfBuffer)
}

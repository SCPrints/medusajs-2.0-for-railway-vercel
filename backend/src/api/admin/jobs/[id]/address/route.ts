import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateOrderWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { ASCOLOUR_WORKSHOP_ADDRESS_1 } from "../../../../../lib/constants"
import { deliveryAddressSchema, normaliseDeliveryAddress } from "../../../../../lib/delivery-address"
import { mergeOrderMetadata } from "../../../../../lib/order-metadata"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { getJob } from "../../../../../services/jobs/build"
import { bustTodayCache } from "../../../../../services/jobs/today"

const schema = z.union([
  z.object({ pickup: z.literal(true) }),
  z.object({ shipping_address: deliveryAddressSchema }),
])

/**
 * POST /admin/jobs/:id/address { shipping_address } | { pickup: true }
 *
 * Sets where the job ships. Stored on the quote (convert reads it) and, once
 * there is an order, written to the order's shipping address — replacing the
 * studio placeholder a job gets when it converts without one.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Enter a street address, suburb and postcode." })

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }
  const pickup = "pickup" in parsed.data
  const addr = "shipping_address" in parsed.data ? normaliseDeliveryAddress(parsed.data.shipping_address) : null
  const method = pickup ? "pickup" : "delivery"

  if (job.quote) {
    const quotes = req.scope.resolve(QUOTE_MODULE) as any
    const q = await quotes.retrieveQuote(job.quote.id)
    const { delivery_address: _old, ...rest } = (q.metadata ?? {}) as Record<string, unknown>
    await quotes.updateQuotes([{ id: job.quote.id, metadata: { ...rest, delivery_method: method, ...(addr ? { delivery_address: addr } : {}) } }])
  }
  if (job.order) {
    if (addr) {
      // Country can't change on an order (Medusa refuses), so it's left out;
      // name/company on the existing address are kept (the workflow merges).
      const { country_code: _c, first_name, last_name, company, ...geo } = addr
      const patch = {
        ...geo,
        address_2: geo.address_2 ?? "",
        province: geo.province ?? "",
        phone: geo.phone ?? "",
        ...(first_name ? { first_name, last_name: last_name ?? "" } : {}),
        ...(company ? { company } : {}),
      }
      // Bill-to follows when it's still the studio placeholder (convert copies
      // the ship-to there); a real billing address the customer gave is kept.
      const current = await (req.scope.resolve(Modules.ORDER) as any)
        .retrieveOrder(job.order.id, { relations: ["billing_address"] })
        .catch(() => null)
      const billingIsStudio =
        !!ASCOLOUR_WORKSHOP_ADDRESS_1 &&
        (!current?.billing_address?.address_1 || current.billing_address.address_1 === ASCOLOUR_WORKSHOP_ADDRESS_1)
      try {
        await updateOrderWorkflow(req.scope).run({
          input: {
            id: job.order.id,
            user_id: (req as any).auth_context?.actor_id,
            shipping_address: patch,
            ...(billingIsStudio ? { billing_address: patch } : {}),
          } as any,
        })
      } catch (err: any) {
        return res.status(400).json({ error: err?.message ?? "Couldn't update the order's address" })
      }
    }
    await mergeOrderMetadata(req.scope, job.order.id, { delivery_method: method })
  }
  bustTodayCache()
  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}

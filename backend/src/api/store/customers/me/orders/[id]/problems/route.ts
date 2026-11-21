import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { PROBLEM_KINDS } from "../../../../../../../lib/customer-requests"
import { isOwnImageUrl, recordRequest, requireOwnOrder } from "../../../../../../../services/customer-portal/requests"

const bodySchema = z.object({
  what: z.enum(PROBLEM_KINDS),
  details: z.string().trim().max(2000).default(""),
  line_item_ids: z.array(z.string().min(1).max(80)).max(50).optional(),
  photo_urls: z.array(z.string().url().max(1000)).max(6).default([]),
})

const WHAT: Record<(typeof PROBLEM_KINDS)[number], string> = {
  wrong_item: "Wrong item",
  wrong_size: "Wrong size",
  print_fault: "Print fault",
  damaged: "Damaged",
  missing: "Missing items",
  other: "Something else",
}

/**
 * POST /store/customers/me/orders/:id/problems { what, details?, line_item_ids?, photo_urls? } → { request }
 * "Something wrong?". Allowed on any order the customer placed (the form is the
 * only gate; staff decide). Photos must be images already uploaded to our own
 * storage. Changes nothing on the order. Someone else's order: 404.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { customerId, order } = await requireOwnOrder(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please tell us what is wrong (details up to 2000 characters, up to 6 photos).")
  const { what, details, photo_urls } = parsed.data
  if (!details && !photo_urls.length && what === "other") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please add a few words or a photo.")
  }
  if (!photo_urls.every(isOwnImageUrl)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Photos must be images uploaded here.")
  const lineIds = new Set(order.items.map((i) => i.id))
  const line_item_ids = (parsed.data.line_item_ids ?? []).filter((id) => lineIds.has(id))
  const lines = order.items.filter((i) => line_item_ids.includes(i.id)).map((i) => i.title ?? i.product_title ?? i.id)

  const text = [
    `Problem reported: ${WHAT[what]}`,
    lines.length ? `Items: ${lines.join(", ")}` : null,
    details ? `\n${details}` : null,
    photo_urls.length ? `\nPhotos:\n${photo_urls.join("\n")}` : null,
  ]
    .filter((p) => p !== null)
    .join("\n")
  const request = await recordRequest(req, order, customerId, { kind: "problem", problem: what, details: details || null, line_item_ids, photo_urls }, {
    text,
    kind: "problem_reported",
    excerpt: `${WHAT[what]}${details ? `: ${details}` : ""}`,
  })
  return res.status(201).json({ request })
}

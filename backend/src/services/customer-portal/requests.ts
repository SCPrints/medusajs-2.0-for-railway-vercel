import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { ulid } from "ulid"

import { MINIO_PUBLIC_URL } from "../../lib/constants"
import { isOurPublicFileUrl } from "../../lib/customer-artwork"
import { appendRequest, MAX_REQUESTS, readRequests, type CustomerRequest } from "../../lib/customer-requests"
import { PORTAL_REQUEST_ACTOR_PREFIX } from "../../lib/job-messages"
import { mergeOrderMetadata } from "../../lib/order-metadata"
import { requireCustomer } from "../../lib/require-customer"
import { ADMIN_WORKSPACE_MODULE } from "../../modules/admin-workspace"
import type { JobAttentionKind } from "../../modules/email-notifications/templates/job-attention"
import { bustTodayCache } from "../jobs/today"
import { loadOwnOrder, type ReorderSourceOrder } from "../reorder/load"
import { raiseAttention } from "../attention/notify"

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif)$/i

/** Photo URLs must be images on our own file host (the client sends them). */
export const isOwnImageUrl = (url: string): boolean =>
  isOurPublicFileUrl(url, MINIO_PUBLIC_URL) && IMAGE_EXT.test(new URL(url).pathname)

/** The caller's own order, else 404 (never 403). */
export async function requireOwnOrder(req: AuthenticatedMedusaRequest): Promise<{ customerId: string; order: ReorderSourceOrder }> {
  const customerId = requireCustomer(req)
  const order = await loadOwnOrder(req.scope, req.params.id, customerId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  return { customerId, order }
}

export const orderLabel = (o: ReorderSourceOrder) => `#${o.display_id ?? String(o.id).slice(-6)}`

/**
 * Stores a problem / size-swap request on order.metadata.customer_requests,
 * writes a diary comment (not an "email:" row, so it is not a thread message),
 * and flags the job. Does nothing to the order, stock or money.
 */
export async function recordRequest(
  req: AuthenticatedMedusaRequest,
  order: ReorderSourceOrder,
  customerId: string,
  request: Omit<CustomerRequest, "id" | "status" | "staff_note" | "created_at" | "decided_at">,
  diary: { text: string; kind: JobAttentionKind; excerpt: string }
): Promise<CustomerRequest> {
  // Nothing will be made or sent, so there's nothing to fix or swap; messages still work.
  if (order.canceled) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order was cancelled. Send us a message about it instead.")
  }
  const list = readRequests(order.metadata)
  const open = list.filter((r) => r.status === "open").length
  if (open >= MAX_REQUESTS / 2) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "You have a lot of open requests on this order. Please email us instead.")
  const full: CustomerRequest = {
    ...request,
    id: ulid(),
    status: "open",
    staff_note: null,
    created_at: new Date().toISOString(),
    decided_at: null,
  }
  await mergeOrderMetadata(req.scope, order.id, { customer_requests: appendRequest(list, full) })
  await (req.scope.resolve(ADMIN_WORKSPACE_MODULE) as any).createOrderComments({
    order_id: order.id,
    body: diary.text,
    created_by: `${PORTAL_REQUEST_ACTOR_PREFIX}${customerId}`,
  })
  await raiseAttention(req.scope, {
    kind: diary.kind,
    order_id: order.id,
    customer_id: customerId,
    label: orderLabel(order),
    from: order.email,
    subject: diary.kind === "problem_reported" ? "Problem reported" : "Size swap requested",
    excerpt: diary.excerpt,
  })
  bustTodayCache()
  return full
}

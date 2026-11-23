import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { ARTWORK_STAGE_EVENT, type ProductionStageChangedEvent } from "../lib/production-stage"
import { clearAttention } from "../services/attention/notify"
import { resolveJobIds } from "../services/jobs/build"

/**
 * A proof going back to the customer (awaiting approval) or being approved
 * answers their change request: close the "Revise the proof" task, which
 * otherwise stays open on the job forever (#122, Nov 2026).
 */
export default async function orderArtworkClearChangeRequestHandler({
  event: { data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  if (!data?.order_id) return
  if (data.to_stage !== "awaiting_approval" && data.to_stage !== "approved") return
  const { orderId, quoteId } = await resolveJobIds(container, data.order_id).catch(() => ({
    orderId: data.order_id,
    quoteId: null,
  }))
  await clearAttention(container, {
    kind: "changes_requested",
    order_id: orderId,
    quote_id: quoteId,
    by: typeof data.changed_by === "string" ? data.changed_by : null,
  })
}

export const config: SubscriberConfig = {
  event: ARTWORK_STAGE_EVENT,
}

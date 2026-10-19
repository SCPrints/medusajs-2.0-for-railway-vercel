import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import {
  ARTWORK_STAGE_EVENT,
  BLANKS_STAGE_EVENT,
  PRODUCTION_STAGE_EVENT,
  type ProductionStageChangedEvent,
  type ProductionTrack,
} from "../lib/production-stage"
import { stageAuditDetails } from "../lib/stage-audit-details"
import { writeAudit } from "../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"

const TRACK_FOR_EVENT: Record<string, ProductionTrack> = {
  [ARTWORK_STAGE_EVENT]: "artwork",
  [BLANKS_STAGE_EVENT]: "blanks",
  [PRODUCTION_STAGE_EVENT]: "production",
}

/**
 * Mirrors every stage-changed event — artwork, blanks AND production — into
 * the audit_log table with `entity = "order"` so the per-order Activity tab
 * shows a unified timeline. Until review 3-8 only the production track was
 * subscribed, so a customer approving or rejecting a proof via the link left
 * no audit row.
 *
 * The stage history itself lives on order.metadata for performance —
 * audit_log is the human-readable layer on top, populated only for
 * events the operator cares to read back.
 */
export default async function orderStageAuditHandler({
  event: { name, data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  if (!data?.order_id) return
  await writeAudit({
    container,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: data.order_id,
    action: AUDIT_ACTION.STAGE_CHANGED,
    actor_id: data.changed_by ?? null,
    actor_email: null,
    details: stageAuditDetails(data, TRACK_FOR_EVENT[name] ?? "production"),
  })
}

export const config: SubscriberConfig = {
  event: [PRODUCTION_STAGE_EVENT, ARTWORK_STAGE_EVENT, BLANKS_STAGE_EVENT],
}

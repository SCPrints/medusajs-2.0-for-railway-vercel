import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import { writeAudit } from "../lib/audit-log"
import { PRODUCTION_LEAD_BUSINESS_DAYS } from "../lib/constants"
import { mergeOrderMetadata } from "../lib/order-metadata"
import { planDueDateOnApproval } from "../lib/production-due-date"
import {
  ARTWORK_STAGE_EVENT,
  type ProductionStageChangedEvent,
} from "../lib/production-stage"

/**
 * When artwork is approved (by the customer's link or by staff), set the
 * production due date to approval + PRODUCTION_LEAD_BUSINESS_DAYS. Dates staff
 * typed in are left alone; an audit row flags them when they're now tight.
 */
export default async function orderArtworkApprovedDueDateHandler({
  event: { data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  if (!data?.order_id || data.to_stage !== "approved") return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  try {
    const order = await orderModuleService.retrieveOrder(data.order_id)
    const meta = (order.metadata ?? {}) as Record<string, unknown>
    const approvedAt = new Date(data.changed_at ?? Date.now())
    const plan = planDueDateOnApproval(meta, approvedAt, PRODUCTION_LEAD_BUSINESS_DAYS)

    if (plan.action === "set") {
      if (meta.production_due_date === plan.due_date) return
      // Atomic key merge — this runs ~50 ms after the staff save that
      // approved the artwork, concurrently with any other stage write
      // (review 3-5).
      await mergeOrderMetadata(container, order.id, {
        production_due_date: plan.due_date,
        production_due_date_source: "auto",
      })
    }

    await writeAudit({
      container,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: order.id,
      action: AUDIT_ACTION.STATUS_CHANGED,
      actor_id: "system",
      details:
        plan.action === "set"
          ? { kind: "due_date_from_approval", due_date: plan.due_date }
          : { kind: "due_date_manual_kept", due_date: plan.due_date, tight: plan.tight },
    })
  } catch (err) {
    logger.warn(
      `due-date-on-approval: ${data.order_id}: ${(err as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: ARTWORK_STAGE_EVENT,
}

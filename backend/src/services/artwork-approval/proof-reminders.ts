import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { businessDaysBetween } from "../../lib/business-days"
import { PROOF_REMINDER_BUSINESS_DAYS } from "../../lib/constants"
import { mergeOrderMetadata } from "../../lib/order-metadata"
import { resolveTracksFromMeta } from "../../lib/production-stage"
import { isNotProceeding } from "../../lib/reports/orders"
import { sendProofEmail } from "./proof-email"

/**
 * Pure: does this order's proof need its one reminder? True when artwork is
 * awaiting approval, the proof went out at least `afterDays` business days
 * ago, and this proof round hasn't been reminded yet (a re-sent proof starts
 * a new round, so the customer can be reminded again).
 */
export function needsProofReminder(
  meta: Record<string, unknown>,
  now: Date,
  afterDays: number = PROOF_REMINDER_BUSINESS_DAYS
): boolean {
  if (resolveTracksFromMeta(meta).artwork !== "awaiting_approval") return false
  const sentMs = Date.parse(String(meta.artwork_stage_changed_at ?? ""))
  if (!Number.isFinite(sentMs)) return false
  const remindedMs = Date.parse(String(meta.artwork_proof_reminder_sent_at ?? ""))
  if (Number.isFinite(remindedMs) && remindedMs >= sentMs) return false
  return businessDaysBetween(new Date(sentMs), now) >= afterDays
}

export async function sendProofReminders(
  container: MedusaContainer,
  options: { now?: Date } = {}
): Promise<{ considered: number; sent: number; failed: number }> {
  const now = options.now ?? new Date()
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService = container.resolve(Modules.ORDER) as any

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "payment_status", "metadata"],
    pagination: { take: 5000, skip: 0 },
  })
  const due = ((orders as any[]) ?? []).filter(
    (o) => !isNotProceeding(o) && needsProofReminder(o.metadata ?? {}, now)
  )

  let sent = 0
  let failed = 0
  for (const o of due) {
    try {
      const order = await orderModuleService.retrieveOrder(o.id, {
        relations: ["shipping_address", "items"],
      })
      const meta = (order.metadata ?? {}) as Record<string, unknown>
      const ok = await sendProofEmail(container, order, {
        idempotencyKey: `artwork-reminder:${order.id}:${meta.artwork_stage_changed_at}`,
        reminder: true,
      })
      if (!ok) {
        failed += 1
        logger.warn(`proof-reminders: no approval link/email for ${order.id}; skipped`)
        continue
      }
      await mergeOrderMetadata(container, order.id, {
        artwork_proof_reminder_sent_at: now.toISOString(),
      })
      sent += 1
    } catch (err: any) {
      failed += 1
      logger.warn(`proof-reminders: ${o.id}: ${err?.message ?? err}`)
    }
  }
  return { considered: due.length, sent, failed }
}

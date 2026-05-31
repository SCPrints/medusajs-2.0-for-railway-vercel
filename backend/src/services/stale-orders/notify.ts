import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import {
  ADMIN_PUBLIC_URL,
  BACKEND_URL,
  STALE_ORDER_MANAGER_EMAIL,
} from "../../lib/constants"
import { getOwner } from "../../lib/crm-owners"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { writeAudit } from "../../lib/audit-log"
import { TASK_MODULE } from "../../modules/task"
import { captureEvent } from "../../lib/posthog"
import { EmailTemplates } from "../../modules/email-notifications/templates"

import type { StaleOrderEntry } from "./scan"

const buildOrderAdminUrl = (orderId: string): string => {
  const root = ADMIN_PUBLIC_URL ?? BACKEND_URL
  return `${root.replace(/\/$/, "")}/app/orders/${orderId}`
}

const resolveUserEmail = async (
  container: MedusaContainer,
  userId: string | null
): Promise<{ email: string; label: string } | null> => {
  if (!userId) return null
  try {
    const userService = container.resolve(Modules.USER) as any
    const user = await userService.retrieveUser(userId)
    if (!user?.email) return null
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
    return { email: user.email, label: name || user.email }
  } catch {
    return null
  }
}

export type NotifyResult = {
  tasks_created: number
  owners_notified: number
  managers_escalated: number
}

const PRIORITY_BY_DAYS = (days: number): "high" | "urgent" => (days >= 7 ? "urgent" : "high")

/**
 * Phase 11 side-effects for *newly*-stale orders: look up the order's
 * owner (or the customer's owner as a fallback), record an `audit_log`
 * row against the order (so the Activity tab surfaces it), create a Task
 * for the owner, fire the `stale_order_notified_owner` PostHog event, and
 * email the owner (STALE_ORDER_OWNER_ALERT).
 *
 * Manager escalation is intentionally NOT done here. A newly-stale order
 * is always ~THRESHOLD days old, so it can never satisfy the documented
 * "THRESHOLD + ESCALATION" window — escalation is handled by the separate
 * escalateStaleOrders() pass below, which the cron drives off orders that
 * have *stayed* stale long enough.
 */
export async function notifyStaleOrders(
  container: MedusaContainer,
  entries: StaleOrderEntry[],
  options: { now?: Date } = {}
): Promise<NotifyResult> {
  const now = options.now ?? new Date()
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderService = container.resolve(Modules.ORDER) as any
  const taskService = container.resolve(TASK_MODULE) as any

  let tasksCreated = 0
  let ownersNotified = 0
  let managersEscalated = 0

  for (const e of entries) {
    // 1) Resolve owner — order owner first, customer owner as fallback.
    let ownerUserId: string | null = null
    try {
      const ord = await getOwner({
        container,
        entity: AUDIT_ENTITY.ORDER,
        entity_id: e.order_id,
      })
      ownerUserId = ord?.user_id ?? null
    } catch {
      /* soft fail */
    }
    if (!ownerUserId && e.customer_id) {
      try {
        const cust = await getOwner({
          container,
          entity: AUDIT_ENTITY.CUSTOMER,
          entity_id: e.customer_id,
        })
        ownerUserId = cust?.user_id ?? null
      } catch {
        /* soft fail */
      }
    }

    if (ownerUserId) {
      // Create the Phase 7 task. Note: idempotency at the task level
      // would require checking for an existing open task — out of
      // scope. In practice the daily cron only fires "newly stale"
      // so the task lands once per stale streak.
      try {
        await taskService.createTasks({
          assignee_user_id: ownerUserId,
          order_id: e.order_id,
          customer_id: e.customer_id,
          title: `Investigate stale order #${e.display_id ?? e.order_id.slice(-6)}`,
          body: `Order has been in "${e.stage}" for ${e.days_in_stage} days. Move it forward or surface a blocker.`,
          due_at: new Date(now.getTime() + 86400000), // 1 day from now
          status: "open",
          priority: PRIORITY_BY_DAYS(e.days_in_stage),
          created_by: "system_stale_orders",
        })
        tasksCreated += 1
      } catch (err: any) {
        logger.warn(
          `stale-orders/notify: createTask failed for ${e.order_id}: ${err?.message ?? err}`
        )
      }

      await writeAudit({
        container,
        entity: AUDIT_ENTITY.ORDER,
        entity_id: e.order_id,
        action: AUDIT_ACTION.STATUS_CHANGED,
        actor_id: "system",
        details: {
          kind: "stale_order_owner_notified",
          owner_user_id: ownerUserId,
          stage: e.stage,
          days_in_stage: e.days_in_stage,
        },
      })
      try {
        captureEvent(ownerUserId, "stale_order_notified_owner", {
          order_id: e.order_id,
          stage: e.stage,
          days_in_stage: e.days_in_stage,
        })
      } catch {
        /* best-effort */
      }

      // Send the email. Best-effort — audit + task + PostHog already
      // landed so a failed send doesn't lose the signal.
      try {
        const owner = await resolveUserEmail(container, ownerUserId)
        if (owner) {
          const notificationService = container.resolve(
            Modules.NOTIFICATION
          ) as any
          await notificationService.createNotifications({
            to: owner.email,
            channel: "email",
            template: EmailTemplates.STALE_ORDER_OWNER_ALERT,
            data: {
              emailOptions: {
                subject: `Stale order #${e.display_id ?? e.order_id.slice(-6)} — ${e.days_in_stage}d in ${e.stage}`,
              },
              alert: {
                orderDisplayId: e.display_id,
                orderId: e.order_id,
                stage: e.stage,
                daysInStage: e.days_in_stage,
                customerEmail: e.email,
                orderUrl: buildOrderAdminUrl(e.order_id),
              },
            },
          })
        }
      } catch (err: any) {
        logger.warn(
          `stale-orders/notify: owner email send failed for ${e.order_id}: ${err?.message ?? err}`
        )
      }

      ownersNotified += 1
    }
  }

  return { tasks_created: tasksCreated, owners_notified: ownersNotified, managers_escalated: managersEscalated }
}

/**
 * Manager-escalation pass. The caller (scanStaleOrders) selects orders that
 * have been stale for at least THRESHOLD + ESCALATION days and haven't been
 * escalated this streak. Here we stamp `metadata.stale_escalated_at` (once
 * per streak — cleared when the order moves stage and becomes fresh again),
 * write an audit row, fire the PostHog event, and email every
 * STALE_ORDER_MANAGER_EMAIL recipient. No-op when no manager inbox is set.
 */
export async function escalateStaleOrders(
  container: MedusaContainer,
  entries: StaleOrderEntry[],
  options: { now?: Date } = {}
): Promise<{ managers_escalated: number }> {
  if (!STALE_ORDER_MANAGER_EMAIL) return { managers_escalated: 0 }
  const recipients = STALE_ORDER_MANAGER_EMAIL.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (recipients.length === 0) return { managers_escalated: 0 }

  const now = options.now ?? new Date()
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderService = container.resolve(Modules.ORDER) as any

  let managersEscalated = 0
  for (const e of entries) {
    try {
      const order = await orderService.retrieveOrder(e.order_id)
      const meta = (order?.metadata ?? {}) as Record<string, unknown>
      if (meta.stale_escalated_at) continue // already escalated this streak

      await orderService.updateOrders(e.order_id, {
        metadata: { ...meta, stale_escalated_at: now.toISOString() },
      })
      await writeAudit({
        container,
        entity: AUDIT_ENTITY.ORDER,
        entity_id: e.order_id,
        action: AUDIT_ACTION.STATUS_CHANGED,
        actor_id: "system",
        details: {
          kind: "stale_order_manager_escalated",
          days_in_stage: e.days_in_stage,
          manager_recipients: STALE_ORDER_MANAGER_EMAIL,
        },
      })
      try {
        captureEvent("system", "stale_order_escalated_to_manager", {
          order_id: e.order_id,
          days_in_stage: e.days_in_stage,
        })
      } catch {
        /* best-effort */
      }

      // Resolve the owner only for the email's display label.
      let ownerLabel: string | null = null
      try {
        const owned = await getOwner({
          container,
          entity: AUDIT_ENTITY.ORDER,
          entity_id: e.order_id,
        })
        const owner = await resolveUserEmail(container, owned?.user_id ?? null)
        ownerLabel = owner?.label ?? null
      } catch {
        /* soft fail */
      }

      try {
        const notificationService = container.resolve(
          Modules.NOTIFICATION
        ) as any
        for (const to of recipients) {
          await notificationService.createNotifications({
            to,
            channel: "email",
            template: EmailTemplates.STALE_ORDER_MANAGER_ESCALATION,
            data: {
              emailOptions: {
                subject: `Escalation: order #${e.display_id ?? e.order_id.slice(-6)} stale ${e.days_in_stage}d`,
              },
              escalation: {
                orderDisplayId: e.display_id,
                orderId: e.order_id,
                stage: e.stage,
                daysInStage: e.days_in_stage,
                ownerLabel,
                customerEmail: e.email,
                orderUrl: buildOrderAdminUrl(e.order_id),
              },
            },
          })
        }
      } catch (err: any) {
        logger.warn(
          `stale-orders/escalate: manager email send failed for ${e.order_id}: ${err?.message ?? err}`
        )
      }

      managersEscalated += 1
    } catch (err: any) {
      logger.warn(
        `stale-orders/escalate: failed for ${e.order_id}: ${err?.message ?? err}`
      )
    }
  }

  return { managers_escalated: managersEscalated }
}

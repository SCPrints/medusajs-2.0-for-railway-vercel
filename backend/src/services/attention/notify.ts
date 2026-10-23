import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  ADMIN_PUBLIC_URL,
  BACKEND_URL,
  CONTACT_NOTIFICATION_EMAIL,
} from "../../lib/constants"
import { addBusinessDays } from "../../lib/business-days"
import { getOwner, pickNextOwner } from "../../lib/crm-owners"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { writeAudit } from "../../lib/audit-log"
import { captureEvent } from "../../lib/posthog"
import { TASK_MODULE } from "../../modules/task"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import type { JobAttentionKind } from "../../modules/email-notifications/templates/job-attention"

export type AttentionInput = {
  kind: JobAttentionKind
  /** Exactly one of these anchors the task. */
  order_id?: string | null
  quote_id?: string | null
  customer_id?: string | null
  /** "#114" or "Q-4GY0KD74V2" — used in the task title and email. */
  label: string
  /** The customer's address, for the email + task body. */
  from?: string | null
  subject?: string | null
  excerpt?: string | null
  /** Staff member already attached to the job (quote.assigned_to). */
  preferred_user_id?: string | null
}

export type AttentionResult = {
  task_id: string | null
  assignee_user_id: string | null
  emailed: string[]
  deduped: boolean
}

const TITLE: Record<JobAttentionKind, (label: string) => string> = {
  customer_reply: (l) => `Reply to the customer — ${l}`,
  accepted_no_order: (l) => `Convert accepted quote ${l} to an order`,
  changes_requested: (l) => `Revise the proof — ${l}`,
}

const BODY: Record<JobAttentionKind, string> = {
  customer_reply:
    "The customer emailed about this job. Read it on the job's Activity, reply, and close this task.",
  accepted_no_order:
    "The customer accepted this quote but no order exists. Convert it (ask for the delivery address if there isn't one), then send the payment link.",
  changes_requested:
    "The customer asked for changes on the proof. Revise the artwork, then re-send the proof.",
}

const jobUrl = (input: AttentionInput): string | null => {
  const root = (ADMIN_PUBLIC_URL ?? BACKEND_URL ?? "").replace(/\/$/, "")
  if (!root) return null
  if (input.order_id) return `${root}/app/jobs/${input.order_id}`
  if (input.quote_id) return `${root}/app/jobs/${input.quote_id}`
  return null
}

async function resolveAssignee(
  container: MedusaContainer,
  input: AttentionInput
): Promise<string | null> {
  const tryOwner = async (entity: any, id: string | null | undefined) => {
    if (!id) return null
    try {
      return (await getOwner({ container, entity, entity_id: id }))?.user_id ?? null
    } catch {
      return null
    }
  }
  return (
    (await tryOwner(AUDIT_ENTITY.ORDER, input.order_id)) ??
    input.preferred_user_id ??
    (await tryOwner(AUDIT_ENTITY.CUSTOMER, input.customer_id)) ??
    (await pickNextOwner({ container }).catch(() => null))?.user_id ??
    null
  )
}

async function userEmail(container: MedusaContainer, userId: string | null): Promise<string | null> {
  if (!userId) return null
  try {
    const user = await (container.resolve(Modules.USER) as any).retrieveUser(userId)
    return typeof user?.email === "string" ? user.email : null
  } catch {
    return null
  }
}

/**
 * The one way a job gets flagged "needs a human": creates a task for the
 * owner (order owner → quote assignee → customer owner → rotation), writes an
 * audit row on the job, emails the owner + CONTACT_NOTIFICATION_EMAIL, and
 * fires a PostHog event. One open task per (job, kind): a second signal of
 * the same kind while the first is still open only refreshes the audit.
 * Never throws — a flag must not break the action that raised it.
 */
export async function raiseAttention(
  container: MedusaContainer,
  input: AttentionInput,
  options: { now?: Date } = {}
): Promise<AttentionResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = options.now ?? new Date()
  const result: AttentionResult = { task_id: null, assignee_user_id: null, emailed: [], deduped: false }

  const entity = input.order_id ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.QUOTE
  const entityId = input.order_id ?? input.quote_id ?? null
  if (!entityId) return result

  await writeAudit({
    container,
    entity,
    entity_id: entityId,
    action: AUDIT_ACTION.COMMENT_POSTED,
    actor_email: input.from ?? null,
    actor_id: input.from ? null : "system",
    details: { kind: `attention:${input.kind}`, subject: input.subject ?? null },
  })

  const taskService = container.resolve(TASK_MODULE) as any
  try {
    const open = await taskService.listTasks(
      {
        ...(input.order_id ? { order_id: input.order_id } : { quote_id: input.quote_id }),
        status: ["open", "in_progress"],
      },
      { take: 50 }
    )
    const existing = (open as any[]).find((t) => t?.metadata?.attention_kind === input.kind)
    if (existing) {
      result.task_id = existing.id
      result.assignee_user_id = existing.assignee_user_id ?? null
      result.deduped = true
    }
  } catch (err: any) {
    logger.warn(`attention: task lookup failed: ${err?.message ?? err}`)
  }

  if (!result.deduped) {
    const assignee = await resolveAssignee(container, input)
    result.assignee_user_id = assignee
    if (assignee) {
      try {
        const task = await taskService.createTasks({
          assignee_user_id: assignee,
          order_id: input.order_id ?? null,
          quote_id: input.quote_id ?? null,
          customer_id: input.customer_id ?? null,
          title: TITLE[input.kind](input.label),
          body: [BODY[input.kind], input.excerpt ? `\n\n“${input.excerpt.slice(0, 400)}”` : ""].join(""),
          due_at: new Date(`${addBusinessDays(now, 1)}T00:00:00+10:00`),
          status: "open",
          priority: "high",
          created_by: "system_attention",
          metadata: { attention_kind: input.kind },
        })
        result.task_id = task?.id ?? null
      } catch (err: any) {
        logger.warn(`attention: createTask failed for ${entityId}: ${err?.message ?? err}`)
      }
    } else {
      logger.warn(`attention: no assignee for ${entityId} (${input.kind}) — email only`)
    }
  }

  // Email staff even on a dedupe: a second customer email still deserves eyes.
  const recipients = Array.from(
    new Set(
      [await userEmail(container, result.assignee_user_id), CONTACT_NOTIFICATION_EMAIL]
        .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
        .filter(Boolean)
    )
  )
  if (recipients.length > 0) {
    try {
      const notifications = container.resolve(Modules.NOTIFICATION) as any
      const subjectBits: Record<JobAttentionKind, string> = {
        customer_reply: `Customer replied — ${input.label}`,
        accepted_no_order: `Accepted, no order — ${input.label}`,
        changes_requested: `Changes requested — ${input.label}`,
      }
      await Promise.all(
        recipients.map((to) =>
          notifications.createNotifications({
            to,
            channel: "email",
            template: EmailTemplates.JOB_ATTENTION,
            data: {
              emailOptions: { subject: subjectBits[input.kind] },
              alert: {
                kind: input.kind,
                label: input.label,
                from: input.from ?? null,
                subject: input.subject ?? null,
                excerpt: input.excerpt ?? null,
                jobUrl: jobUrl(input),
              },
            },
          })
        )
      )
      result.emailed = recipients
    } catch (err: any) {
      logger.warn(`attention: staff email failed for ${entityId}: ${err?.message ?? err}`)
    }
  }

  try {
    captureEvent(result.assignee_user_id ?? "system", "job_attention_raised", {
      kind: input.kind,
      order_id: input.order_id ?? null,
      quote_id: input.quote_id ?? null,
      deduped: result.deduped,
      task_created: !!result.task_id && !result.deduped,
    })
  } catch {
    /* best-effort */
  }

  return result
}

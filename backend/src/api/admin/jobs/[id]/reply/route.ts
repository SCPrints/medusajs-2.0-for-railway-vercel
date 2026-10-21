import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { orderInboxAddress, quoteInboxAddress } from "../../../../../lib/order-inbox-alias"
import { ADMIN_WORKSPACE_MODULE } from "../../../../../modules/admin-workspace"
import { EmailTemplates } from "../../../../../modules/email-notifications/templates"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { TASK_MODULE } from "../../../../../modules/task"
import { getJob, STAFF_EMAIL_ACTOR_PREFIX, STAFF_NOTE_ACTOR_PREFIX } from "../../../../../services/jobs/build"

const schema = z.object({
  channel: z.enum(["email", "note"]).default("email"),
  body: z.string().trim().min(1).max(8000),
  subject: z.string().trim().max(200).optional(),
})

/**
 * POST /admin/jobs/:id/reply { channel: "email" | "note", body, subject? }
 *
 * `email`: sends the text to the customer (Reply-To = the job's inbox alias,
 * so their answer lands back on the job) and logs it as an outbound entry.
 * `note`: logs a call / something that happened off-system. Either way the
 * job stops being "waiting on us", and any open customer-reply task closes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" })
  const { channel, body } = parsed.data
  const actor = (req as any).auth_context?.actor_id ?? "staff"

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }

  const to = job.customer.email
  if (channel === "email") {
    if (!to) return res.status(400).json({ error: "This job has no customer email." })
    const label = job.order ? `order #${job.order.display_id ?? ""}` : `quote ${job.quote?.public_id ?? ""}`
    const subject = parsed.data.subject || `Re: your SC Prints ${label}`.trim()
    const replyTo = (job.order ? orderInboxAddress(job.order.id) : quoteInboxAddress(job.quote!.id)) ?? SUPPORT_REPLY_TO_EMAIL
    const notifications = req.scope.resolve(Modules.NOTIFICATION) as any
    await notifications.createNotifications({
      to,
      channel: "email",
      template: EmailTemplates.CUSTOMER_MESSAGE,
      data: {
        emailOptions: { subject, replyTo },
        message: { body, signature: "SC Prints\ninfo@scprints.com.au · scprints.com.au" },
      },
    })
  }

  const logBody = channel === "email" ? body : `Note: ${body}`
  if (job.order) {
    const workspace = req.scope.resolve(ADMIN_WORKSPACE_MODULE) as any
    await workspace.createOrderComments({
      order_id: job.order.id,
      body: logBody,
      created_by: `${channel === "email" ? STAFF_EMAIL_ACTOR_PREFIX : STAFF_NOTE_ACTOR_PREFIX}${actor}`,
    })
  } else if (job.quote) {
    const quotes = req.scope.resolve(QUOTE_MODULE) as any
    await quotes.createQuoteEvents([
      {
        quote_id: job.quote.id,
        type: channel === "email" ? "message" : "note",
        actor,
        body: channel === "email" ? { direction: "out", to, subject: parsed.data.subject ?? null, text: body } : { text: body },
      },
    ])
  }
  await writeAudit({
    container: req.scope,
    entity: job.order ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.QUOTE,
    entity_id: job.order?.id ?? job.quote!.id,
    action: channel === "email" ? AUDIT_ACTION.EMAIL_SENT : AUDIT_ACTION.NOTE_ADDED,
    actor_id: actor,
    details: { kind: channel === "email" ? "job_reply" : "job_note", to: channel === "email" ? to : null },
  })

  // Answering closes the "customer waiting" task.
  if (channel === "email") {
    try {
      const tasks = req.scope.resolve(TASK_MODULE) as any
      const open = job.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled")
      const ids = open.map((t) => t.id)
      if (ids.length) {
        const rows: any[] = await tasks.listTasks({ id: ids }, { take: 50 })
        for (const t of rows) {
          if (t?.metadata?.attention_kind === "customer_reply") {
            await tasks.updateTasks({ id: t.id, status: "done", completed_at: new Date(), completed_by: actor })
          }
        }
      }
    } catch {
      /* best-effort */
    }
  }

  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}

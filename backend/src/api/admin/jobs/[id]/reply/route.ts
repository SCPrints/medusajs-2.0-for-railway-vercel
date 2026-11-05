import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { SUPPORT_REPLY_TO_EMAIL } from "../../../../../lib/constants"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { commentSubject, orderInboxAddress, quoteInboxAddress, replySubject, threadHeaders } from "../../../../../lib/order-inbox-alias"
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
 * The customer's most recent email on this job: its subject and, for quote
 * messages, its Message-ID. Order comments keep only the subject.
 */
// ponytail: inbound order comments store no Message-ID, so order replies thread by subject only; store it on the comment if Apple Mail users complain.
async function lastInbound(scope: any, job: { order: { id: string } | null; quote: { id: string } | null }) {
  const pg = scope.resolve("__pg_connection__")
  const found: { at: number; subject: string | null; message_id: string | null }[] = []
  if (job.quote) {
    const { rows } = await pg.raw(
      `select body, created_at from quote_event
        where quote_id = ? and type = 'message' and body->>'direction' = 'in' and deleted_at is null
        order by created_at desc limit 1`,
      [job.quote.id]
    )
    const r = rows?.[0]
    if (r) found.push({ at: new Date(r.created_at).getTime(), subject: r.body?.subject ?? null, message_id: r.body?.message_id ?? null })
  }
  if (job.order) {
    const { rows } = await pg.raw(
      `select body, created_at from order_comment
        where order_id = ? and created_by like 'email:%' and deleted_at is null
        order by created_at desc limit 1`,
      [job.order.id]
    )
    const r = rows?.[0]
    if (r) found.push({ at: new Date(r.created_at).getTime(), subject: commentSubject(String(r.body ?? "")), message_id: null })
  }
  return found.sort((a, b) => b.at - a.at)[0] ?? null
}

/** "Collins\nSC Prints\n…" when the sender has a first name, else just the shop. */
async function signatureFor(scope: any, actor: string): Promise<string> {
  const shop = "SC Prints\ninfo@scprints.com.au · scprints.com.au"
  const user = actor.startsWith("user_") ? await (scope.resolve(Modules.USER) as any).retrieveUser(actor).catch(() => null) : null
  return user?.first_name ? `${user.first_name}\n${shop}` : shop
}

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
  let subject: string | null = null
  if (channel === "email") {
    if (!to) return res.status(400).json({ error: "This job has no customer email." })
    const label = job.order ? `order #${job.order.display_id ?? ""}` : `quote ${job.quote?.public_id ?? ""}`
    // Answer in the customer's own thread when they wrote to us.
    const theirs = await lastInbound(req.scope, job).catch(() => null)
    subject = parsed.data.subject || replySubject(theirs?.subject) || `Re: your SC Prints ${label}`.trim()
    const replyTo = (job.order ? orderInboxAddress(job.order.id) : quoteInboxAddress(job.quote!.id)) ?? SUPPORT_REPLY_TO_EMAIL
    const notifications = req.scope.resolve(Modules.NOTIFICATION) as any
    await notifications.createNotifications({
      to,
      channel: "email",
      template: EmailTemplates.CUSTOMER_MESSAGE,
      data: {
        emailOptions: { subject, replyTo, headers: threadHeaders(theirs?.message_id) },
        message: { body, signature: await signatureFor(req.scope, actor) },
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
        // The prefix marks a composer note as answering the customer (build.ts).
        actor: channel === "email" ? actor : `${STAFF_NOTE_ACTOR_PREFIX}${actor}`,
        body: channel === "email" ? { direction: "out", to, subject, text: body } : { text: body },
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

  // Answering — by email or a logged call — closes the "customer waiting" task.
  {
    try {
      const tasks = req.scope.resolve(TASK_MODULE) as any
      const open = job.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled")
      const ids = open.map((t) => t.id)
      if (ids.length) {
        const rows: any[] = await tasks.listTasks({ id: ids }, { take: 50 })
        for (const t of rows) {
          const dueFollowUp = t?.metadata?.follow_up === true && t.due_at && new Date(t.due_at).getTime() <= Date.now()
          if (t?.metadata?.attention_kind === "customer_reply" || dueFollowUp) {
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

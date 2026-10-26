import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { CONTACT_NOTIFICATION_EMAIL, ORDER_INBOX_DOMAIN, RESEND_FROM_EMAIL } from "../../lib/constants"
import { STAFF_EMAIL_ACTOR_PREFIX } from "../../lib/job-state"
import { parseInboxAlias, stripQuotedReply } from "../../lib/order-inbox-alias"
import { ADMIN_WORKSPACE_MODULE } from "../../modules/admin-workspace"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { QUOTE_MODULE } from "../../modules/quote"
import { raiseAttention } from "../attention/notify"

export type InboundEmail = {
  to: string[]
  from: string | null
  subject: string | null
  text: string | null
  html: string | null
  /** Provider message id, kept on the activity row for tracing. */
  message_id?: string | null
}

export type RecordResult =
  | { ok: true; kind: "order" | "quote"; id: string; task_id: string | null }
  | { ok: false; reason: "no_alias" | "not_found" }

const htmlToText = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()

/** The bare address out of `Name <a@b>`, lower-cased. */
const bareAddress = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()

/**
 * One of our own mailboxes: same domain as the address we send from
 * (orders@scprints.com.au → scprints.com.au). Staff answering an enquiry from
 * Gmail reply to the customer AND the job's address, so their answer reaches
 * the webhook too — it is our reply, not the customer writing in.
 */
export function isStaffSender(from: string | null | undefined): boolean {
  const domain = RESEND_FROM_EMAIL ? bareAddress(RESEND_FROM_EMAIL).split("@")[1] : null
  if (!from || !domain) return false
  return bareAddress(from).endsWith(`@${domain}`)
}

/** The reply's own text: plain text first, else de-tagged html, then the quoted thread cut off. */
export function inboundBodyText(msg: Pick<InboundEmail, "text" | "html">): string {
  const raw = msg.text?.trim() || (msg.html ? htmlToText(msg.html) : "")
  const own = stripQuotedReply(raw)
  return (own || raw || "(empty)").slice(0, 8000)
}

/**
 * Writes a customer email onto the job its alias names — an order comment or
 * a quote `message` event — and raises the "customer waiting on us" flag
 * (task for the owner + staff email). Used by the Resend `email.received`
 * webhook and the generic /hooks/inbound-email route.
 */
export async function recordInboundEmail(
  container: MedusaContainer,
  msg: InboundEmail
): Promise<RecordResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const alias = msg.to.map(parseInboxAlias).find((a) => a !== null) ?? null
  if (!alias) return { ok: false, reason: "no_alias" }

  const pg = container.resolve<any>("__pg_connection__")
  const from = msg.from?.trim() || null
  const body = inboundBodyText(msg)
  const header = `From: ${from ?? "unknown"}${msg.subject ? ` · Subject: ${msg.subject}` : ""}`
  // Our own reply (from Gmail): recorded as our email, no "customer waiting" flag.
  const staff = isStaffSender(from)
  const actor = staff ? `${STAFF_EMAIL_ACTOR_PREFIX}${bareAddress(from!)}` : from ? `email:${from}` : "email"

  if (alias.kind === "order") {
    const { rows } = await pg.raw(
      `select o.id, o.display_id, o.customer_id
         from "order" o
        where o.id ilike ? and o.deleted_at is null
        limit 1`,
      [`%${alias.suffix}`]
    )
    const order = rows?.[0]
    if (!order) return { ok: false, reason: "not_found" }

    const workspace = container.resolve(ADMIN_WORKSPACE_MODULE) as any
    await workspace.createOrderComments({
      order_id: order.id,
      body: `${header}\n\n${body}`,
      created_by: actor,
    })
    if (staff) {
      logger.info(`inbound-email: order ${order.id} ← staff reply from ${from}`)
      return { ok: true, kind: "order", id: order.id, task_id: null }
    }
    const attention = await raiseAttention(container, {
      kind: "customer_reply",
      order_id: order.id,
      customer_id: order.customer_id ?? null,
      label: `#${order.display_id ?? String(order.id).slice(-6)}`,
      from,
      subject: msg.subject,
      excerpt: body,
    })
    logger.info(`inbound-email: order ${order.id} ← ${from ?? "?"} (task ${attention.task_id ?? "none"})`)
    return { ok: true, kind: "order", id: order.id, task_id: attention.task_id }
  }

  const { rows } = await pg.raw(
    `select q.id, q.public_id, q.customer_id, q.assigned_to
       from quote q
      where q.id ilike ? and q.deleted_at is null
      limit 1`,
    [`%${alias.suffix}`]
  )
  const quote = rows?.[0]
  if (!quote) return { ok: false, reason: "not_found" }

  const quotes = container.resolve(QUOTE_MODULE) as any
  await quotes.createQuoteEvents([
    {
      quote_id: quote.id,
      type: "message",
      actor,
      body: {
        direction: staff ? "out" : "in",
        from,
        subject: msg.subject,
        text: body,
        message_id: msg.message_id ?? null,
      },
    },
  ])
  if (staff) {
    logger.info(`inbound-email: quote ${quote.id} ← staff reply from ${from}`)
    return { ok: true, kind: "quote", id: quote.id, task_id: null }
  }
  const attention = await raiseAttention(container, {
    kind: "customer_reply",
    quote_id: quote.id,
    customer_id: quote.customer_id ?? null,
    preferred_user_id: quote.assigned_to ?? null,
    label: quote.public_id ? String(quote.public_id) : String(quote.id).slice(-8),
    from,
    subject: msg.subject,
    excerpt: body,
  })
  logger.info(`inbound-email: quote ${quote.id} ← ${from ?? "?"} (task ${attention.task_id ?? "none"})`)
  return { ok: true, kind: "quote", id: quote.id, task_id: attention.task_id }
}

/**
 * Mail on the inbox domain that matches no job (an old or mistyped alias, a
 * deleted job, a bare address) goes to the staff inbox instead of being
 * dropped. Reply-To is the sender, so answering is one click from Gmail.
 * Throws when the send fails, so the webhook can ask the provider to retry.
 */
export async function forwardUnmatchedEmail(container: MedusaContainer, msg: InboundEmail): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const to = CONTACT_NOTIFICATION_EMAIL?.trim()
  if (!to) {
    logger.warn("inbound-email: unmatched email not forwarded — CONTACT_NOTIFICATION_EMAIL is unset")
    return false
  }
  const from = msg.from?.trim() || null
  // Never forward our own inbox's mail back to us (auto-replies, loops).
  if (from && ORDER_INBOX_DOMAIN && bareAddress(from).endsWith(`@${ORDER_INBOX_DOMAIN.toLowerCase()}`)) return false

  const notifications = container.resolve(Modules.NOTIFICATION) as any
  await notifications.createNotifications({
    to,
    channel: "email",
    template: EmailTemplates.JOB_ATTENTION,
    data: {
      emailOptions: {
        subject: `Unmatched email${msg.subject ? ` — ${msg.subject}` : ""}`,
        ...(from ? { replyTo: from } : {}),
      },
      alert: {
        kind: "unmatched_email",
        label: `Sent to ${msg.to.join(", ") || "a job address"}`,
        from,
        subject: msg.subject,
        excerpt: inboundBodyText(msg),
        jobUrl: null,
      },
    },
  })
  return true
}

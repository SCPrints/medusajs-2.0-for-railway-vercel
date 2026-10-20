import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { INBOUND_EMAIL_SECRET } from "../../../lib/constants"
import { recordInboundEmail } from "../../../services/inbound-email/record"

/**
 * POST /hooks/inbound-email — generic inbound-email provider shape
 * (Postmark, SendGrid Inbound Parse, a mail rule that POSTs JSON):
 *
 *   { "to": "inbox+ord<id>@<domain>" | ["…"], "from", "subject", "text", "html" }
 *
 * Auth: header `x-inbound-secret: ${INBOUND_EMAIL_SECRET}`. Resend's own
 * inbound routing goes through /hooks/resend (`email.received`) instead,
 * which is signature-verified. Both end in recordInboundEmail.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (INBOUND_EMAIL_SECRET) {
    if (req.headers["x-inbound-secret"] !== INBOUND_EMAIL_SECRET) {
      return res.status(401).json({ error: "unauthorised" })
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  const to = Array.isArray(body.to)
    ? (body.to as unknown[]).filter((t): t is string => typeof t === "string")
    : str(body.to)
      ? [str(body.to) as string]
      : []

  const result = await recordInboundEmail(req.scope, {
    to,
    from: str(body.from),
    subject: str(body.subject),
    text: str(body.text),
    html: str(body.html),
    message_id: str(body.message_id),
  })

  if (result.ok === false) {
    return res
      .status(result.reason === "no_alias" ? 400 : 404)
      .json({ error: result.reason, to })
  }
  return res.json({ ok: true, kind: result.kind, id: result.id, task_id: result.task_id })
}

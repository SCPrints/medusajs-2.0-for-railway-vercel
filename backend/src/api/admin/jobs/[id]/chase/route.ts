import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { buildApprovalUrl } from "../../../../../services/artwork-approval/proof-email"
import { getJob } from "../../../../../services/jobs/build"
import { signQuoteAccept } from "../../../../../services/quote-accept/sign"

/**
 * GET /admin/jobs/:id/chase → { to, body } | { need_payment_link: true }
 *
 * The draft for the board's "Chase" button: a short reminder with the link
 * the customer needs (proof approval, quote accept, or payment). Staff read
 * and edit it, then it goes out through POST /admin/jobs/:id/reply like any
 * other email, so it lands in the diary and replies come back to the job.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }
  const to = job.customer.email
  if (!to) return res.status(400).json({ error: "This job has no customer email. Log a call instead." })

  const hi = `Hi ${job.customer.name?.trim().split(/\s+/)[0] || "there"},`
  const orderNo = job.order ? `order #${job.order.display_id ?? ""}` : ""
  const kind = job.state.next_action.kind
  let lines: string[]

  if (kind === "wait_proof" && job.order) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id: job.order.id }, pagination: { take: 1 } })
    const url = buildApprovalUrl(job.order.id, (data as any[])?.[0]?.metadata)
    if (!url) return res.status(400).json({ error: "No proof link for this job. Open the job to send the proof." })
    lines = [`Just checking you've seen the proof for your ${orderNo}. You can approve it or ask for changes here:`, url, "We'll start on it as soon as it's approved."]
  } else if (kind === "nudge_quote" && job.quote) {
    const base = process.env.STOREFRONT_URL?.replace(/\/$/, "")
    if (!base) return res.status(400).json({ error: "STOREFRONT_URL isn't set, so there is no quote link." })
    const country = (process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au").toLowerCase()
    const url = `${base}/${country}/quote-accept/${encodeURIComponent(job.quote.id)}?sig=${signQuoteAccept(job.quote.id)}`
    lines = ["Just following up on the quote we sent through. You can view and accept it here:", url, "Any questions, just reply to this email."]
  } else if (kind === "nudge_payment" && job.order) {
    const link = job.money.open_payment_link?.url
    if (!link) return res.json({ need_payment_link: true })
    const owing = new Intl.NumberFormat("en-AU", { style: "currency", currency: job.money.currency_code.toUpperCase() }).format(job.money.outstanding ?? 0)
    lines = [`A quick reminder that ${owing} is still owing on your ${orderNo}. You can pay by card here:`, link]
  } else {
    return res.status(400).json({ error: "Nothing to chase on this job right now." })
  }

  return res.json({ to, body: [hi, ...lines, "Thanks,"].join("\n\n") })
}

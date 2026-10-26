/**
 * Turn recent contact-form enquiries that have no job into jobs (Jobs list →
 * New). From 2026-10-27 the contact form does this itself; this catches the
 * ones that arrived before. Idempotent. Skips an enquiry when:
 *   - any quote already carries its submission id (staff often started those
 *     jobs as admin quotes), or
 *   - the sender already has a quote or order made on or after it — they are
 *     a job already, under another route (cart, BYO, staff).
 *
 * Usage (prod):
 *   cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/backfill-enquiry-jobs.js
 *   cd /app/.medusa/server && npx medusa exec src/scripts/backfill-enquiry-jobs.js
 * DAYS=14 (default) sets how far back to look.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { listContactSubmissions } from "../lib/contact-submissions"
import { QUOTE_MODULE } from "../modules/quote"
import { startJobFromEnquiry } from "../services/jobs/start-from-enquiry"

export default async function backfillEnquiryJobs({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const dryRun = process.env.DRY_RUN === "1"
  const days = Number(process.env.DAYS ?? 14)
  const since = Date.now() - days * 86_400_000

  const { rows } = await listContactSubmissions({ q: "", limit: 500 })
  const recent = rows.filter((s) => Date.parse(String(s.created_at)) >= since)

  const quotes = container.resolve(QUOTE_MODULE) as any
  const allQuotes: any[] = await quotes.listQuotes({}, { take: 2000, select: ["email", "created_at", "metadata"] })
  const linked = new Set(allQuotes.map((q) => q?.metadata?.contact_submission_id).filter(Boolean))

  // Work that counts is made after the enquiry, so inside the window; emails are compared lower-cased below.
  const { data: orders } = await query.graph({ entity: "order", fields: ["email", "created_at"], filters: { created_at: { $gte: new Date(since) } } })
  /** Latest quote or order per sender email. */
  const latestWork = new Map<string, number>()
  for (const r of [...allQuotes, ...((orders as any[]) ?? [])]) {
    const email = String(r?.email ?? "").toLowerCase()
    const at = Date.parse(String(r?.created_at ?? ""))
    if (email && Number.isFinite(at) && at > (latestWork.get(email) ?? 0)) latestWork.set(email, at)
  }

  let created = 0
  logger.info(`backfill-enquiry-jobs: ${recent.length} enquiries in the last ${days} days${dryRun ? " (dry run)" : ""}`)
  for (const s of recent) {
    const label = `${new Date(s.created_at).toISOString().slice(0, 10)} · ${s.email} · ${s.subject || "(no subject)"}`
    if (linked.has(s.id)) {
      logger.info(`  skip (already a job): ${label}`)
      continue
    }
    if ((latestWork.get(s.email.toLowerCase()) ?? 0) >= Date.parse(String(s.created_at))) {
      logger.info(`  skip (sender already has a quote/order since): ${label}`)
      continue
    }
    if (dryRun) {
      logger.info(`  would create: ${label}`)
      continue
    }
    const job = await startJobFromEnquiry(container, s, "backfill")
    created += job.existed ? 0 : 1
    logger.info(`  ${job.existed ? "already had" : "created"} ${job.public_id}: ${label}`)
  }
  logger.info(`backfill-enquiry-jobs: ${dryRun ? "dry run, nothing written" : `${created} job(s) created`}`)
}

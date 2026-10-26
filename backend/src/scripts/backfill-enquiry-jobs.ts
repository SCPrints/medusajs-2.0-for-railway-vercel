/**
 * Turn recent contact-form enquiries that have no job into jobs (Jobs list →
 * New). From 2026-10-27 the contact form does this itself; this catches the
 * ones that arrived before. Idempotent: an enquiry that already has a job is
 * skipped.
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
  const dryRun = process.env.DRY_RUN === "1"
  const days = Number(process.env.DAYS ?? 14)
  const since = Date.now() - days * 86_400_000

  const { rows } = await listContactSubmissions({ q: "", limit: 500 })
  const recent = rows.filter((s) => Date.parse(String(s.created_at)) >= since)

  const quotes = container.resolve(QUOTE_MODULE) as any
  const existing: any[] = await quotes.listQuotes({ source: "contact" }, { take: 1000, select: ["metadata"] })
  const done = new Set(existing.map((q) => q?.metadata?.contact_submission_id).filter(Boolean))

  const todo = recent.filter((s) => !done.has(s.id))
  logger.info(`backfill-enquiry-jobs: ${recent.length} enquiries in the last ${days} days, ${todo.length} without a job${dryRun ? " (dry run)" : ""}`)
  for (const s of todo) {
    const label = `${s.created_at} · ${s.email} · ${s.subject ?? "(no subject)"}`
    if (dryRun) {
      logger.info(`  would create: ${label}`)
      continue
    }
    const job = await startJobFromEnquiry(container, s, "backfill")
    logger.info(`  ${job.existed ? "already had" : "created"} ${job.public_id}: ${label}`)
  }
}

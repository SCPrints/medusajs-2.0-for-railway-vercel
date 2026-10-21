import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { businessDaysBetween } from "../../lib/business-days"
import { QUOTE_MODULE } from "../../modules/quote"
import { raiseAttention } from "./notify"

export type AcceptedQuoteRow = {
  id: string
  status: string
  accepted_at: Date | string | null
  metadata: Record<string, unknown> | null
}

/**
 * Pure: accepted quotes with no order after `limit` business days (default 1)
 * that haven't been flagged yet. Dean's case — accepted 16 Oct under the old
 * cart flow, nothing said so for five days.
 */
export function selectAcceptedWithoutOrder(
  rows: AcceptedQuoteRow[],
  now: Date,
  limit = 1
): string[] {
  const ids: string[] = []
  for (const row of rows) {
    if (row?.status !== "accepted" || !row.accepted_at) continue
    const meta = row.metadata ?? {}
    if (typeof meta.order_id === "string" && meta.order_id) continue
    if (meta.accepted_no_order_flagged_at) continue
    const at = row.accepted_at instanceof Date ? row.accepted_at : new Date(row.accepted_at)
    if (!Number.isFinite(at.getTime())) continue
    // ponytail: 30-day window so the first run doesn't flag every pre-Oct-16
    // acceptance that died in a cart; older ones are a manual sweep.
    if (now.getTime() - at.getTime() > 30 * 86_400_000) continue
    if (businessDaysBetween(at, now) >= limit) ids.push(row.id)
  }
  return ids
}

export async function scanAcceptedQuotes(
  container: MedusaContainer,
  options: { now?: Date } = {}
): Promise<{ considered: number; flagged: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = options.now ?? new Date()
  const quotes = container.resolve(QUOTE_MODULE) as any

  const rows: any[] = await quotes.listQuotes(
    { status: "accepted" },
    { take: 1000, select: ["id", "status", "accepted_at", "metadata", "public_id", "customer_id", "assigned_to"] }
  )
  const ids = new Set(selectAcceptedWithoutOrder(rows, now))
  let flagged = 0
  for (const q of rows) {
    if (!ids.has(q.id)) continue
    try {
      await raiseAttention(container, {
        kind: "accepted_no_order",
        quote_id: q.id,
        customer_id: q.customer_id ?? null,
        preferred_user_id: q.assigned_to ?? null,
        label: q.public_id ? String(q.public_id) : String(q.id).slice(-8),
      })
      await quotes.updateQuotes([
        {
          id: q.id,
          metadata: { ...(q.metadata ?? {}), accepted_no_order_flagged_at: now.toISOString() },
        },
      ])
      flagged += 1
    } catch (err: any) {
      logger.warn(`attention/accepted-quotes: ${q.id}: ${err?.message ?? err}`)
    }
  }
  return { considered: rows.length, flagged }
}

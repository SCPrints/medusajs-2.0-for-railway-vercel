import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { QUOTE_MODULE } from "../../modules/quote"
import {
  pickReminder,
  type ReminderLine,
  type ReminderOrder,
} from "../../lib/reorder-reminder-rules"

/**
 * Customers who are due a re-order reminder. Pure read: no side effects, no
 * email. `send-reminders.ts` sends. The rules (own median gap, the order they
 * repeat most, open order / cart / quote, 60-day cap, a year-ago season) live
 * in lib/reorder-reminder-rules.ts, which has the tests.
 */

export type ReorderCandidate = {
  customer_id: string | null
  email: string
  first_name: string | null
  /** The order we remind them about (the one they repeat most). */
  last_order_id: string
  last_order_display_id: number | null
  last_order_at: string
  median_gap_days: number
  days_since_last: number
  order_count: number
  trigger: "pattern" | "season"
  /** What they ordered that time: names and quantities, no prices. */
  lines: ReminderLine[]
  country_code: string | null
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0))

export async function buildReorderCandidates(
  container: MedusaContainer,
  options: { now?: Date; minMedianGapDays?: number; maxMedianGapDays?: number } = {}
): Promise<ReorderCandidate[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = options.now ?? new Date()

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "status",
      "email",
      "customer_id",
      "metadata",
      "shipping_address.first_name",
      "shipping_address.country_code",
      "items.id",
      "items.title",
      "items.product_title",
      "items.variant_title",
      "items.variant_id",
      "items.product_id",
      "items.quantity",
      "items.thumbnail",
      "items.metadata",
    ],
    pagination: { take: 5000, skip: 0 },
  })

  type Group = {
    customer_id: string | null
    email: string
    first_name: string | null
    country_code: string | null
    orders: ReminderOrder[]
  }
  const byCustomer = new Map<string, Group>()
  for (const o of (orders as any[]) ?? []) {
    if (o?.status === "canceled") continue
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created) || created > now.getTime()) continue
    if (typeof o.email !== "string" || !o.email) continue
    const key = (o.customer_id as string) || o.email
    const g = byCustomer.get(key) ?? {
      customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
      email: o.email,
      first_name: null,
      country_code: null,
      orders: [],
    }
    g.first_name ||= o.shipping_address?.first_name ?? null
    g.country_code ||= o.shipping_address?.country_code?.toLowerCase?.() ?? null
    g.orders.push({
      id: o.id,
      display_id: typeof o.display_id === "number" ? o.display_id : null,
      created_at: created,
      stage: typeof o.metadata?.production_stage === "string" ? o.metadata.production_stage : null,
      items: (o.items ?? []).map((i: any) => ({ ...i, quantity: num(i.quantity) })),
    })
    byCustomer.set(key, g)
  }

  // Last reminder per customer (customer.metadata).
  const customerIds = [...byCustomer.values()].map((c) => c.customer_id).filter((x): x is string => !!x)
  const lastSent = new Map<string, number>()
  if (customerIds.length) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "metadata"],
        filters: { id: customerIds },
        pagination: { take: customerIds.length, skip: 0 },
      })
      for (const c of (customers as any[]) ?? []) {
        const ms = Date.parse(c?.metadata?.last_reorder_reminder_sent_at ?? "")
        if (Number.isFinite(ms)) lastSent.set(c.id, ms)
      }
    } catch {
      // Non-fatal: treated as never reminded; the send step still stamps.
    }
  }

  // Open carts (lines in them, touched in the last 30 days) and open quotes, by email.
  const openEmails = new Set<string>()
  try {
    const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const rows = await knex("cart as c")
      .whereNull("c.completed_at")
      .whereNull("c.deleted_at")
      .whereNotNull("c.email")
      .whereRaw("c.updated_at > now() - interval '30 days'")
      .whereExists(knex("cart_line_item as li").select(1).whereRaw("li.cart_id = c.id").whereNull("li.deleted_at"))
      .select(knex.raw("lower(c.email) as email"))
    for (const r of rows) openEmails.add(r.email)
    const quotes: any[] = await (container.resolve(QUOTE_MODULE) as any).listQuotes(
      { status: ["new", "quoted"] },
      { take: 2000, select: ["id", "email"] }
    )
    for (const q of quotes) if (q.email) openEmails.add(String(q.email).toLowerCase())
  } catch {
    // ponytail: if we can't tell, send nothing rather than risk nagging a live customer.
    return []
  }

  const candidates: ReorderCandidate[] = []
  for (const c of byCustomer.values()) {
    const open = openEmails.has(c.email.toLowerCase())
    const pick = pickReminder({
      orders: c.orders,
      now: now.getTime(),
      lastReminderAt: c.customer_id ? lastSent.get(c.customer_id) ?? null : null,
      hasOpenCart: open,
      minGapDays: options.minMedianGapDays,
      maxGapDays: options.maxMedianGapDays,
    })
    if (!pick) continue
    candidates.push({
      customer_id: c.customer_id,
      email: c.email,
      first_name: c.first_name,
      last_order_id: pick.order.id,
      last_order_display_id: pick.order.display_id,
      last_order_at: new Date(pick.order.created_at).toISOString(),
      median_gap_days: pick.median_gap_days,
      days_since_last: pick.days_since_last,
      order_count: c.orders.length,
      trigger: pick.trigger,
      lines: pick.lines,
      country_code: c.country_code,
    })
  }

  // Most overdue first, so a rate limit drops the least pressing.
  candidates.sort((a, b) => b.days_since_last - b.median_gap_days - (a.days_since_last - a.median_gap_days))
  return candidates
}

import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import {
  fetchOrdersForReports,
  inRange,
  pctDelta,
} from "../../lib/reports/orders"
import {
  STAGE_SLA_DAYS,
  type ProductionStage,
} from "../../lib/production-stage"

/**
 * Build the data payload for the monthly owner digest. Pure aggregation
 * over orders + variants — same data the admin Reports page renders, but
 * pre-computed so the email template stays dumb.
 *
 * Defaults to "last full calendar month vs the month before that". Pass
 * an explicit window for testing.
 */

export type MonthlyDigestPayload = {
  period: { from: string; to: string; label: string }
  prior: { from: string; to: string; label: string }
  headline: {
    revenue: { current: number; prior: number; delta_pct: number | null }
    orders: { current: number; prior: number; delta_pct: number | null }
    aov: { current: number; prior: number; delta_pct: number | null }
    distinct_customers: {
      current: number
      prior: number
      delta_pct: number | null
    }
    new_customers: {
      current: number
      prior: number
      delta_pct: number | null
    }
  }
  top_products: Array<{ title: string; quantity: number; revenue: number }>
  rfm_movers: {
    champions: number
    at_risk: number
    hibernating: number
    new_customer: number
  }
  production: {
    transitions: number
    breaches: number
    breach_pct: number
    severe_breaches: number
    currently_breaching: number
  }
  highlights: string[]
  currency_code: string
}

const monthLabel = (d: Date): string =>
  d.toLocaleString("en-AU", { month: "long", year: "numeric" })

/**
 * `now`-anchored "last full calendar month". E.g. running on 2026-05-15
 * yields April 2026 [from=2026-04-01, to=2026-05-01).
 */
export const lastFullMonth = (now = new Date()): { from: Date; to: Date } => {
  const to = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
  return { from, to }
}

const monthBefore = (
  range: { from: Date; to: Date }
): { from: Date; to: Date } => ({
  from: new Date(
    range.from.getFullYear(),
    range.from.getMonth() - 1,
    1,
    0,
    0,
    0,
    0
  ),
  to: range.from,
})

export async function buildMonthlyDigest(
  container: MedusaContainer,
  options: { now?: Date } = {}
): Promise<MonthlyDigestPayload> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = options.now ?? new Date()
  const period = lastFullMonth(now)
  const prior = monthBefore(period)

  const orders = await fetchOrdersForReports(query)

  // ---- Headline KPIs --------------------------------------------------
  let revCurrent = 0
  let revPrior = 0
  let ordersCurrent = 0
  let ordersPrior = 0
  const customersCurrent = new Set<string>()
  const customersPrior = new Set<string>()
  // First-order lookup across the full history available so we can flag
  // "new customer" as someone whose *first* order falls in the current month.
  const firstOrderByCustomer = new Map<string, number>()
  for (const o of orders) {
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created)) continue
    const key = (o.customer_id as string) || (o.email as string) || ""
    if (key) {
      const existing = firstOrderByCustomer.get(key) ?? Infinity
      if (created < existing) firstOrderByCustomer.set(key, created)
    }
  }

  // Sets, not counters — a new customer who places 2+ orders in the period
  // must count once (distinct_customers already de-dups; new_customers used
  // to over-count by incrementing per in-period order).
  const newCustomersCurrentSet = new Set<string>()
  const newCustomersPriorSet = new Set<string>()
  let currency = "AUD"
  // Top product aggregation
  const productAgg = new Map<
    string,
    { title: string; quantity: number; revenue: number }
  >()

  for (const o of orders) {
    if (o?.status === "canceled") continue
    if (typeof o.currency_code === "string") {
      currency = o.currency_code.toUpperCase()
    }
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created)) continue
    const total = Number(o.total ?? 0)
    const key = (o.customer_id as string) || (o.email as string) || ""

    if (inRange(o.created_at, period.from, period.to)) {
      revCurrent += total
      ordersCurrent += 1
      if (key) {
        customersCurrent.add(key)
        const firstOrder = firstOrderByCustomer.get(key)
        if (firstOrder != null && firstOrder >= period.from.getTime()) {
          newCustomersCurrentSet.add(key)
        }
      }
      // Top products in current period only
      for (const it of (o.items ?? []) as any[]) {
        const id =
          (it?.product_id as string) ||
          (it?.variant_id as string) ||
          (it?.id as string) ||
          ""
        if (!id) continue
        // Aggregated per product, so label with the product title — `title`
        // is the variant line ("Staple Tee — ORANGE / S").
        const title =
          (it?.product_title as string) ||
          (it?.title as string) ||
          "(unknown)"
        const qty = Number(it?.quantity ?? 0)
        const lineRevenue = Number(it?.unit_price ?? 0) * qty
        const existing = productAgg.get(id)
        if (existing) {
          existing.quantity += qty
          existing.revenue += lineRevenue
        } else {
          productAgg.set(id, { title, quantity: qty, revenue: lineRevenue })
        }
      }
    } else if (inRange(o.created_at, prior.from, prior.to)) {
      revPrior += total
      ordersPrior += 1
      if (key) {
        customersPrior.add(key)
        const firstOrder = firstOrderByCustomer.get(key)
        if (
          firstOrder != null &&
          firstOrder >= prior.from.getTime() &&
          firstOrder < prior.to.getTime()
        ) {
          newCustomersPriorSet.add(key)
        }
      }
    }
  }

  const newCustomersCurrent = newCustomersCurrentSet.size
  const newCustomersPrior = newCustomersPriorSet.size

  const aovCurrent = ordersCurrent > 0 ? revCurrent / ordersCurrent : 0
  const aovPrior = ordersPrior > 0 ? revPrior / ordersPrior : 0

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      quantity: p.quantity,
      revenue: Math.round(p.revenue * 100) / 100,
    }))

  // ---- RFM movers (segment counts, not full breakdown) ---------------
  // Lightweight version of /admin/reports/rfm — count buckets only.
  type RfmBucket = "champions" | "at_risk" | "hibernating" | "new_customer"
  const rfmCounts: Record<RfmBucket, number> = {
    champions: 0,
    at_risk: 0,
    hibernating: 0,
    new_customer: 0,
  }
  // Re-aggregate per customer over full available window, anchored at
  // period.to — same logic as the RFM route, abridged.
  type CustomerAgg = {
    orders: number
    revenue: number
    last_order_at: number
  }
  const byCustomer = new Map<string, CustomerAgg>()
  for (const o of orders) {
    if (o?.status === "canceled") continue
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created)) continue
    if (created > period.to.getTime()) continue
    const key = (o.customer_id as string) || (o.email as string) || ""
    if (!key) continue
    const total = Number(o.total ?? 0)
    const existing = byCustomer.get(key)
    if (!existing) {
      byCustomer.set(key, { orders: 1, revenue: total, last_order_at: created })
    } else {
      existing.orders += 1
      existing.revenue += total
      if (created > existing.last_order_at) existing.last_order_at = created
    }
  }
  const recencies = Array.from(byCustomer.values())
    .map((c) => Math.max(0, (period.to.getTime() - c.last_order_at) / 86_400_000))
    .sort((a, b) => a - b)
  const frequencies = Array.from(byCustomer.values())
    .map((c) => c.orders)
    .sort((a, b) => a - b)
  const monetaries = Array.from(byCustomer.values())
    .map((c) => c.revenue)
    .sort((a, b) => a - b)

  const score = (sortedAsc: number[], v: number, inverted = false): number => {
    if (sortedAsc.length === 0) return 1
    let idx = sortedAsc.findIndex((x) => x >= v)
    if (idx === -1) idx = sortedAsc.length - 1
    const pct = sortedAsc.length === 1 ? 1 : idx / (sortedAsc.length - 1)
    const raw = Math.min(5, Math.max(1, Math.ceil(pct * 5) || 1))
    return inverted ? 6 - raw : raw
  }

  for (const c of byCustomer.values()) {
    const recency = Math.max(
      0,
      (period.to.getTime() - c.last_order_at) / 86_400_000
    )
    const r = score(recencies, recency, true)
    const f = score(frequencies, c.orders)
    const m = score(monetaries, c.revenue)
    if (r >= 4 && f >= 4 && m >= 4) rfmCounts.champions += 1
    else if (r <= 2 && f >= 3 && m >= 3) rfmCounts.at_risk += 1
    else if (r <= 2 && f <= 2 && m <= 2) rfmCounts.hibernating += 1
    else if (r >= 4 && f === 1) rfmCounts.new_customer += 1
  }

  // ---- Production: SLA + currently breaching --------------------------
  let transitions = 0
  let breaches = 0
  let severeBreaches = 0
  let currentlyBreachingCount = 0
  const nowMs = now.getTime()
  for (const order of orders) {
    const meta = (order?.metadata ?? {}) as Record<string, unknown>
    const rawHistory = meta.production_stage_history
    if (!Array.isArray(rawHistory) || rawHistory.length === 0) continue
    const sortedHistory = [...rawHistory]
      .filter(
        (e: any) =>
          e &&
          typeof e === "object" &&
          typeof e.stage === "string" &&
          typeof e.changed_at === "string"
      )
      .sort(
        (a: any, b: any) => Date.parse(a.changed_at) - Date.parse(b.changed_at)
      )
    for (let i = 0; i < sortedHistory.length - 1; i++) {
      const stage = sortedHistory[i].stage as ProductionStage
      const enteredMs = Date.parse(sortedHistory[i].changed_at)
      const exitedMs = Date.parse(sortedHistory[i + 1].changed_at)
      if (!Number.isFinite(enteredMs) || !Number.isFinite(exitedMs)) continue
      if (
        exitedMs < period.from.getTime() ||
        exitedMs >= period.to.getTime()
      ) {
        continue
      }
      const sla = STAGE_SLA_DAYS[stage]
      if (sla == null) continue
      const days = Math.max(0, (exitedMs - enteredMs) / 86_400_000)
      transitions += 1
      if (days > sla * 2) {
        severeBreaches += 1
        breaches += 1
      } else if (days > sla) {
        breaches += 1
      }
    }
    const last = sortedHistory[sortedHistory.length - 1]
    if (last) {
      const stage = last.stage as ProductionStage
      const sla = STAGE_SLA_DAYS[stage]
      const enteredMs = Date.parse(last.changed_at)
      if (sla != null && Number.isFinite(enteredMs)) {
        const days = Math.max(0, (nowMs - enteredMs) / 86_400_000)
        if (days > sla) currentlyBreachingCount += 1
      }
    }
  }

  // ponytail: no inventory section. Every stocked level is a supplier feed
  // or a 1,000,000-unit placeholder (Aug 2026 digest reported 7.79M "dead
  // units"). Re-add only if SC Prints starts holding real stock.

  // ---- Highlights — short, derived bullets for the email top --------
  const highlights: string[] = []
  const revDelta = pctDelta(revCurrent, revPrior)
  if (revDelta !== null) {
    const direction = revDelta >= 0 ? "up" : "down"
    highlights.push(
      `Revenue ${direction} ${Math.abs(revDelta).toFixed(1)}% vs ${monthLabel(prior.from)}.`
    )
  }
  if (newCustomersCurrent > 0) {
    highlights.push(
      `${newCustomersCurrent} new customer${newCustomersCurrent === 1 ? "" : "s"} placed their first order.`
    )
  }
  if (rfmCounts.at_risk > 0) {
    highlights.push(
      `${rfmCounts.at_risk} customer${rfmCounts.at_risk === 1 ? " is" : "s are"} now in the At Risk bucket — worth a win-back email.`
    )
  }
  if (currentlyBreachingCount > 0) {
    highlights.push(
      `${currentlyBreachingCount} order${currentlyBreachingCount === 1 ? " is" : "s are"} currently past SLA.`
    )
  }
  return {
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      label: monthLabel(period.from),
    },
    prior: {
      from: prior.from.toISOString(),
      to: prior.to.toISOString(),
      label: monthLabel(prior.from),
    },
    headline: {
      revenue: {
        current: Math.round(revCurrent * 100) / 100,
        prior: Math.round(revPrior * 100) / 100,
        delta_pct: revDelta,
      },
      orders: {
        current: ordersCurrent,
        prior: ordersPrior,
        delta_pct: pctDelta(ordersCurrent, ordersPrior),
      },
      aov: {
        current: Math.round(aovCurrent * 100) / 100,
        prior: Math.round(aovPrior * 100) / 100,
        delta_pct: pctDelta(aovCurrent, aovPrior),
      },
      distinct_customers: {
        current: customersCurrent.size,
        prior: customersPrior.size,
        delta_pct: pctDelta(customersCurrent.size, customersPrior.size),
      },
      new_customers: {
        current: newCustomersCurrent,
        prior: newCustomersPrior,
        delta_pct: pctDelta(newCustomersCurrent, newCustomersPrior),
      },
    },
    top_products: topProducts,
    rfm_movers: rfmCounts,
    production: {
      transitions,
      breaches,
      breach_pct:
        transitions > 0 ? Math.round((breaches / transitions) * 1000) / 10 : 0,
      severe_breaches: severeBreaches,
      currently_breaching: currentlyBreachingCount,
    },
    highlights,
    currency_code: currency,
  }
}

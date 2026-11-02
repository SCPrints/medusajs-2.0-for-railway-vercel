import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { STAGE_SLA_DAYS } from "../../lib/production-stage"
import {
  computeStageDwellDays,
  currentTrackStages,
  fetchOrdersForReports,
  inRange,
  isNotProceeding,
  isOpenUnshipped,
  shippedAt,
  stageTransitions,
} from "../../lib/reports/orders"

/**
 * Compute the current value for every supported alert metric. Returns a
 * single map so the cron only walks orders + variants once per run.
 *
 * Keep new metrics additive — the alert model stores `metric` as a free
 * text key, so adding entries here is enough to make them available.
 */

export type MetricKey =
  | "sla_breach_pct_7d"
  | "currently_breaching_count"
  | "reprint_rate_7d"
  | "dead_stock_units"
  | "capacity_red"
  | "top10_customer_share"

export const METRIC_LABELS: Record<MetricKey, string> = {
  sla_breach_pct_7d: "SLA breach % (last 7 days)",
  currently_breaching_count: "Open orders past SLA right now",
  reprint_rate_7d: "Reprint rate % (last 7 days)",
  dead_stock_units: "Retired: all stock belongs to suppliers (always 0)",
  capacity_red: "Capacity status = red (1 / 0)",
  top10_customer_share: "Top 10 customers' revenue share %",
}

export type MetricSnapshot = Record<MetricKey, number>

const sevenDaysAgo = (now: Date): Date =>
  new Date(now.getTime() - 7 * 86_400_000)

const thirtyDaysAgo = (now: Date): Date =>
  new Date(now.getTime() - 30 * 86_400_000)

export async function evaluateMetrics(
  container: MedusaContainer,
  options: { now?: Date } = {}
): Promise<MetricSnapshot> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = options.now ?? new Date()
  const window7Start = sevenDaysAgo(now)
  const window30Start = thirtyDaysAgo(now)
  const nowMs = now.getTime()

  const orders = await fetchOrdersForReports(query)

  // ---- SLA breach %, last 7 days ----
  let slaTransitions = 0
  let slaBreaches = 0
  // ---- Currently breaching open orders ----
  let currentlyBreaching = 0
  // ---- Reprint rate, last 7 days ----
  let reprintEventOrderIds = new Set<string>()
  let ordersWorkedLast7 = new Set<string>()
  // ---- Top-10 concentration over last 30 days ----
  type CustomerAgg = { revenue: number }
  const byCustomer30 = new Map<string, CustomerAgg>()
  let total30 = 0
  // ---- Capacity red signal ----
  let openUnshipped = 0
  let shippedLast30 = 0

  for (const o of orders) {
    if (o?.status === "canceled") continue

    // SLA + reprint walk: each move against the previous entry on its own track.
    let touchedLast7 = false
    for (const t of stageTransitions(o)) {
      if (!inRange(t.exited_at, window7Start, now)) continue
      touchedLast7 = true
      if (t.rollback) reprintEventOrderIds.add(o.id)
    }
    for (const dwell of computeStageDwellDays(o)) {
      if (!inRange(dwell.exited_at, window7Start, now)) continue
      const sla = STAGE_SLA_DAYS[dwell.stage]
      if (sla == null) continue
      slaTransitions += 1
      if (dwell.days > sla) slaBreaches += 1
    }
    if (touchedLast7) ordersWorkedLast7.add(o.id)

    // Currently breaching: the stage each track is on now, same as the SLA report.
    const delivered = (o.metadata as any)?.production_stage === "delivered"
    for (const { track, stage, changed_at } of currentTrackStages(o)) {
      if (delivered && track !== "production") continue
      const sla = STAGE_SLA_DAYS[stage]
      if (sla == null) continue
      const daysAt = Math.max(0, (nowMs - Date.parse(changed_at)) / 86_400_000)
      if (daysAt > sla) currentlyBreaching += 1
    }

    // Capacity: open jobs against the rate we finish them.
    if (isOpenUnshipped(o)) openUnshipped += 1
    const shipped = shippedAt(o)
    if (shipped && !isNotProceeding(o) && Date.parse(shipped) >= window30Start.getTime()) {
      shippedLast30 += 1
    }

    // Customer concentration: revenue grouped by customer (last 30 days)
    const created = Date.parse(o?.created_at ?? "")
    if (Number.isFinite(created) && created >= window30Start.getTime()) {
      const key = (o.customer_id as string) || (o.email as string) || ""
      if (key) {
        const total = Number(o.total ?? 0)
        const existing = byCustomer30.get(key)
        if (existing) existing.revenue += total
        else byCustomer30.set(key, { revenue: total })
        total30 += total
      }
    }
  }

  const slaBreachPct =
    slaTransitions > 0 ? (slaBreaches / slaTransitions) * 100 : 0

  const reprintRate =
    ordersWorkedLast7.size > 0
      ? (reprintEventOrderIds.size / ordersWorkedLast7.size) * 100
      : 0

  // Top-10 concentration
  const top10Revenue = Array.from(byCustomer30.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .reduce((s, c) => s + c.revenue, 0)
  const top10Share = total30 > 0 ? (top10Revenue / total30) * 100 : 0

  // Capacity red: same formula as /admin/reports/capacity.
  const throughputPerDay = shippedLast30 / 30
  const daysOfWork = throughputPerDay > 0 ? openUnshipped / throughputPerDay : 0
  const capacityRed = daysOfWork > 14 ? 1 : 0

  return {
    sla_breach_pct_7d: Math.round(slaBreachPct * 10) / 10,
    currently_breaching_count: currentlyBreaching,
    reprint_rate_7d: Math.round(reprintRate * 10) / 10,
    // ponytail: every stocked unit sits at a supplier warehouse, so "dead stock"
    // can't mean anything until the shop holds its own. Kept so old alert rows load.
    dead_stock_units: 0,
    capacity_red: capacityRed,
    top10_customer_share: Math.round(top10Share * 10) / 10,
  }
}

export const compareValue = (
  value: number,
  comparator: string,
  threshold: number
): boolean => {
  switch (comparator) {
    case "gt":
      return value > threshold
    case "gte":
      return value >= threshold
    case "lt":
      return value < threshold
    case "lte":
      return value <= threshold
    case "eq":
      return value === threshold
    default:
      return false
  }
}


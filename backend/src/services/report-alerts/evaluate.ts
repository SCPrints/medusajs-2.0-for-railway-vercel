import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import {
  ARTWORK_STAGES,
  BLANKS_STAGES,
  DOWNSTREAM_STAGES,
  DOWNSTREAM_STAGE_SLA_DAYS,
  STAGE_SLA_DAYS,
  resolveTracksFromMeta,
  type ProductionStage,
  type ProductionTrack,
} from "../../lib/production-stage"
import {
  fetchOrdersForReports,
  inRange,
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
  dead_stock_units: "Stocked units unsold 180+ days",
  capacity_red: "Capacity status = red (1 / 0)",
  top10_customer_share: "Top 10 customers' revenue share %",
}

export type MetricSnapshot = Record<MetricKey, number>

/**
 * Resolve a stage value to its position WITHIN ITS OWN TRACK (normalising
 * legacy aliases). `PRODUCTION_STAGES` is a union of all three parallel tracks,
 * NOT a chronological order — so comparing union indices mistakes a normal
 * cross-track forward move (e.g. artwork `approved` → production `in_production`)
 * for a rollback. Track-relative ordinals make rollback detection accurate.
 */
function trackPosition(
  stage: string
): { track: ProductionTrack; index: number } | null {
  let s = stage
  if (s === "art_review") s = "in_review"
  else if (s === "blanks_ordered") s = "ordered"
  else if (s === "blanks_arrived") s = "arrived"

  let idx = (ARTWORK_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "artwork", index: idx }
  idx = (BLANKS_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "blanks", index: idx }
  idx = (DOWNSTREAM_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "production", index: idx }
  return null
}

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
  let pipelineWorkDays = 0
  let shippedLast30 = 0

  for (const o of orders) {
    if (o?.status === "canceled") continue
    const meta = (o?.metadata ?? {}) as Record<string, unknown>
    const rawHistory = meta.production_stage_history
    const sortedHistory = Array.isArray(rawHistory)
      ? [...rawHistory]
          .filter(
            (e: any) =>
              e &&
              typeof e === "object" &&
              typeof e.stage === "string" &&
              typeof e.changed_at === "string"
          )
          .sort(
            (a: any, b: any) =>
              Date.parse(a.changed_at) - Date.parse(b.changed_at)
          )
      : []

    // SLA + reprint walk
    let touchedLast7 = false
    // Track the most recent ordinal seen PER TRACK so a reprint is detected as
    // a genuine within-track regression, not a union-index artefact.
    const lastTrackIdx: Partial<Record<ProductionTrack, number>> = {}
    const firstPos = sortedHistory.length
      ? trackPosition(sortedHistory[0].stage as string)
      : null
    if (firstPos) lastTrackIdx[firstPos.track] = firstPos.index

    for (let i = 1; i < sortedHistory.length; i++) {
      const transitionAt = sortedHistory[i].changed_at as string
      const fromStage = sortedHistory[i - 1].stage as ProductionStage
      const toStage = sortedHistory[i].stage as ProductionStage
      const inWin = inRange(transitionAt, window7Start, now)

      // Reprint: a within-track BACKWARD step relative to that track's prior
      // position. Counted only if it happened in the window. Update the
      // per-track pointer even for out-of-window entries so the baseline stays
      // accurate. (PRODUCTION_STAGES is a union, not an order — the old
      // union-index comparison flagged normal cross-track forward moves.)
      const pos = trackPosition(toStage)
      if (pos) {
        const prev = lastTrackIdx[pos.track]
        if (inWin && prev != null && pos.index < prev) {
          reprintEventOrderIds.add(o.id)
        }
        lastTrackIdx[pos.track] = pos.index
      }

      if (!inWin) continue
      touchedLast7 = true

      // SLA: count completed dwell on `fromStage`
      const enteredMs = Date.parse(sortedHistory[i - 1].changed_at as string)
      const exitedMs = Date.parse(transitionAt)
      const sla = STAGE_SLA_DAYS[fromStage]
      if (
        sla != null &&
        Number.isFinite(enteredMs) &&
        Number.isFinite(exitedMs)
      ) {
        const days = Math.max(0, (exitedMs - enteredMs) / 86_400_000)
        slaTransitions += 1
        if (days > sla) slaBreaches += 1
      }
    }
    if (touchedLast7) ordersWorkedLast7.add(o.id)

    // Currently breaching: latest stage (any track) sat longer than its SLA.
    const last = sortedHistory[sortedHistory.length - 1]
    if (last) {
      const stage = last.stage as ProductionStage
      const sla = STAGE_SLA_DAYS[stage]
      const enteredMs = Date.parse(last.changed_at as string)
      if (sla != null && Number.isFinite(enteredMs) && stage !== "delivered") {
        const daysAt = Math.max(0, (nowMs - enteredMs) / 86_400_000)
        if (daysAt > sla) currentlyBreaching += 1
      }
    }

    // Pipeline work-days remaining — sum remaining DOWNSTREAM-track SLAs only.
    // Anchored on the order's resolved downstream stage (not the latest entry
    // of any track) and walking DOWNSTREAM_STAGES (a real sequence) instead of
    // the PRODUCTION_STAGES union, so artwork/blanks SLAs aren't double-counted.
    const downstream = resolveTracksFromMeta(meta).downstream
    const dIdx = (DOWNSTREAM_STAGES as readonly string[]).indexOf(downstream)
    if (dIdx >= 0 && downstream !== "delivered") {
      // Time already spent in the current downstream stage, if recorded.
      let daysInDownstream = 0
      for (let i = sortedHistory.length - 1; i >= 0; i--) {
        if (sortedHistory[i].stage === downstream) {
          const enteredMs = Date.parse(sortedHistory[i].changed_at as string)
          if (Number.isFinite(enteredMs)) {
            daysInDownstream = Math.max(0, (nowMs - enteredMs) / 86_400_000)
          }
          break
        }
      }
      const currentSla = DOWNSTREAM_STAGE_SLA_DAYS[downstream]
      let workLeft =
        currentSla != null ? Math.max(0, currentSla - daysInDownstream) : 0
      for (let i = dIdx + 1; i < DOWNSTREAM_STAGES.length; i++) {
        const s = DOWNSTREAM_STAGES[i]
        if (s === "delivered") continue
        const sla2 = DOWNSTREAM_STAGE_SLA_DAYS[s]
        if (sla2 != null) workLeft += sla2
      }
      pipelineWorkDays += workLeft
    }

    // Throughput: shipped in last 30 days
    if (Array.isArray(rawHistory)) {
      for (const e of rawHistory as any[]) {
        if (e?.stage === "shipped" && typeof e?.changed_at === "string") {
          const t = Date.parse(e.changed_at)
          if (Number.isFinite(t) && t >= window30Start.getTime()) {
            shippedLast30 += 1
          }
          break
        }
      }
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

  // Capacity red: same logic as /admin/reports/capacity — both accumulate
  // pipelineWorkDays from the DOWNSTREAM track only (see the pipeline block
  // above) and divide by daily throughput.
  const throughputPerDay = shippedLast30 / 30
  const daysOfWork =
    throughputPerDay > 0 ? pipelineWorkDays / throughputPerDay : 0
  const capacityRed = daysOfWork > 14 ? 1 : 0

  // Dead stock
  let deadUnits = 0
  try {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "manage_inventory",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { manage_inventory: true },
      pagination: { take: 5000, skip: 0 },
    })
    const lastSoldByVariant = new Map<string, number>()
    for (const o of orders) {
      if (o?.status === "canceled") continue
      const created = Date.parse(o?.created_at ?? "")
      if (!Number.isFinite(created)) continue
      for (const it of (o.items ?? []) as any[]) {
        const vid = it?.variant_id
        if (typeof vid !== "string") continue
        const prev = lastSoldByVariant.get(vid) ?? 0
        if (created > prev) lastSoldByVariant.set(vid, created)
      }
    }
    for (const v of (variants as any[]) ?? []) {
      let stocked = 0
      let reserved = 0
      for (const ii of v.inventory_items ?? []) {
        for (const lvl of ii?.inventory?.location_levels ?? []) {
          stocked += Number(lvl?.stocked_quantity ?? 0)
          reserved += Number(lvl?.reserved_quantity ?? 0)
        }
      }
      const inStock = stocked - reserved
      if (inStock <= 0) continue
      const lastSold = lastSoldByVariant.get(v.id) ?? null
      if (lastSold === null) {
        deadUnits += inStock
        continue
      }
      const days = (nowMs - lastSold) / 86_400_000
      if (days > 180) deadUnits += inStock
    }
  } catch {
    // Defensive: dead-stock signal degrades to 0 if inventory graph is unavailable.
  }

  return {
    sla_breach_pct_7d: Math.round(slaBreachPct * 10) / 10,
    currently_breaching_count: currentlyBreaching,
    reprint_rate_7d: Math.round(reprintRate * 10) / 10,
    dead_stock_units: deadUnits,
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


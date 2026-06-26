import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  DOWNSTREAM_STAGES,
  DOWNSTREAM_STAGE_SLA_DAYS,
  PRODUCTION_STAGES,
  STAGE_SLA_DAYS,
  resolveTracksFromMeta,
  type ProductionStage,
} from "../../../../lib/production-stage"
import {
  itemMethod,
  loadOrdersOr500,
  matchesRegion,
  parseRegionFilter,
  type DecorationMethod,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/capacity
 *
 * Operational forecast view: how much work is in the pipeline right now,
 * what's the recent throughput, and when will each open order ship?
 *
 * Methodology:
 *   - Pipeline = orders whose current stage is non-terminal (not delivered).
 *   - Per-order projected ship date = now + sum(STAGE_SLA_DAYS for each
 *     remaining stage including the current one's residual). Residual =
 *     max(0, STAGE_SLA - days_already_at_stage).
 *   - Throughput = orders shipped (entered "shipped" stage) in the last
 *     30 days / 30, days. Capacity status is pipeline_days / throughput_per_day.
 *   - "This week's ships" = projected_ship_date within next 7 days.
 *
 * Operational, not period-bound — date-range filter is intentionally
 * ignored. Region filter still applies.
 */
const NON_TERMINAL_STAGES = PRODUCTION_STAGES.filter(
  (s) => s !== "delivered"
)

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const orders = await loadOrdersOr500(query, res, logger, "capacity")
  if (!orders) return

  const now = Date.now()
  // ---- Throughput: orders that *entered* "shipped" in last 30 days ----
  const thirtyDaysAgo = now - 30 * 86_400_000
  let shippedLast30 = 0
  for (const o of orders) {
    if (!matchesRegion(o, regionFilter)) continue
    const meta = (o?.metadata ?? {}) as Record<string, unknown>
    const rawHistory = meta.production_stage_history
    if (!Array.isArray(rawHistory)) continue
    for (const e of rawHistory) {
      if (
        e &&
        typeof e === "object" &&
        (e as any).stage === "shipped" &&
        typeof (e as any).changed_at === "string"
      ) {
        const t = Date.parse((e as any).changed_at)
        if (Number.isFinite(t) && t >= thirtyDaysAgo) shippedLast30 += 1
        break
      }
    }
  }
  const throughputPerDay = shippedLast30 / 30

  // ---- Pipeline: open orders + projected ship dates ----
  type OpenOrder = {
    order_id: string
    display_id: number | null
    customer_email: string | null
    current_stage: ProductionStage
    days_at_current_stage: number
    methods: DecorationMethod[]
    work_days_remaining: number
    projected_ship_at: string
    total: number
    currency_code: string
  }

  const open: OpenOrder[] = []
  let pipelineWorkDays = 0
  const stageLoadCounts = new Map<ProductionStage, number>()
  for (const stage of NON_TERMINAL_STAGES) stageLoadCounts.set(stage, 0)

  for (const order of orders) {
    if (!matchesRegion(order, regionFilter)) continue
    if (order?.status === "canceled") continue
    const meta = (order?.metadata ?? {}) as Record<string, unknown>
    const rawCurrent = meta.production_stage
    const currentStage =
      typeof rawCurrent === "string" &&
      (PRODUCTION_STAGES as readonly string[]).includes(rawCurrent)
        ? (rawCurrent as ProductionStage)
        : null
    if (!currentStage || currentStage === "delivered") continue

    const rawHistory = meta.production_stage_history
    const sorted = Array.isArray(rawHistory)
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
    const daysInStage = (stage: string): number => {
      const last = [...sorted].reverse().find((e: any) => e.stage === stage)
      if (!last) return 0
      const t = Date.parse(last.changed_at as string)
      return Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 0
    }
    const daysAtCurrent = daysInStage(currentStage)

    // Remaining production work is the DOWNSTREAM track only. `meta.production_stage`
    // can hold an artwork/blanks-track value, and PRODUCTION_STAGES is a UNION
    // (not a chronological sequence) — iterating it from currentIdx+1 summed
    // unrelated prep-track SLAs and over-stated the pipeline. Anchor on the
    // resolved downstream stage and walk DOWNSTREAM_STAGES (a real sequence).
    // Mirrors services/report-alerts/evaluate.ts so the capacity_red alert and
    // this page agree. Residual = max(0, downstream SLA − days in it); "shipped"
    // SLA is kept (in-transit wait), "delivered" excluded.
    const downstream = resolveTracksFromMeta(meta).downstream
    const dIdx = (DOWNSTREAM_STAGES as readonly string[]).indexOf(downstream)
    const currentSla = DOWNSTREAM_STAGE_SLA_DAYS[downstream] ?? 0
    let workDaysRemaining = Math.max(0, currentSla - daysInStage(downstream))
    if (dIdx >= 0) {
      for (let i = dIdx + 1; i < DOWNSTREAM_STAGES.length; i++) {
        const stage = DOWNSTREAM_STAGES[i]
        if (stage === "delivered") continue
        const sla = DOWNSTREAM_STAGE_SLA_DAYS[stage]
        if (sla != null) workDaysRemaining += sla
      }
    }
    pipelineWorkDays += workDaysRemaining
    stageLoadCounts.set(
      currentStage,
      (stageLoadCounts.get(currentStage) ?? 0) + 1
    )

    const projectedShipMs = now + workDaysRemaining * 86_400_000
    const items = (order.items ?? []) as any[]
    const methods = Array.from(new Set(items.map((it) => itemMethod(it))))

    open.push({
      order_id: order.id,
      display_id:
        typeof order.display_id === "number" ? order.display_id : null,
      customer_email:
        typeof order.email === "string" ? order.email : null,
      current_stage: currentStage,
      days_at_current_stage: Math.round(daysAtCurrent * 10) / 10,
      methods,
      work_days_remaining: Math.round(workDaysRemaining * 10) / 10,
      projected_ship_at: new Date(projectedShipMs).toISOString(),
      total: Number(order.total ?? 0),
      currency_code:
        typeof order.currency_code === "string"
          ? order.currency_code.toUpperCase()
          : "AUD",
    })
  }

  open.sort(
    (a, b) =>
      Date.parse(a.projected_ship_at) - Date.parse(b.projected_ship_at)
  )

  // Capacity health: how many days of work is in the pipeline relative
  // to current daily throughput?
  const daysOfWorkInPipeline =
    throughputPerDay > 0 ? pipelineWorkDays / throughputPerDay : null
  let capacityStatus: "green" | "amber" | "red" | "unknown" = "unknown"
  if (daysOfWorkInPipeline === null) {
    capacityStatus = "unknown"
  } else if (daysOfWorkInPipeline <= 7) {
    capacityStatus = "green"
  } else if (daysOfWorkInPipeline <= 14) {
    capacityStatus = "amber"
  } else {
    capacityStatus = "red"
  }

  // Bucket open orders by projected ship week.
  type ShipBucket = { week_start: string; ships: number; revenue: number }
  const bucketByMs = new Map<number, ShipBucket>()
  for (const o of open) {
    const t = Date.parse(o.projected_ship_at)
    if (!Number.isFinite(t)) continue
    // Week starts Monday in UTC.
    const d = new Date(t)
    const dow = d.getUTCDay()
    const diff = (dow + 6) % 7
    const weekStartMs =
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      diff * 86_400_000
    const existing = bucketByMs.get(weekStartMs) ?? {
      week_start: new Date(weekStartMs).toISOString().slice(0, 10),
      ships: 0,
      revenue: 0,
    }
    existing.ships += 1
    existing.revenue += o.total
    bucketByMs.set(weekStartMs, existing)
  }
  const projectedShipsByWeek = Array.from(bucketByMs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)

  // "Today" / "this week" quick counters.
  const startOfTodayMs = (() => {
    const d = new Date(now)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  })()
  const endOfTodayMs = startOfTodayMs + 86_400_000
  const sevenDaysMs = startOfTodayMs + 7 * 86_400_000
  const shipsToday = open.filter((o) => {
    const t = Date.parse(o.projected_ship_at)
    return t >= startOfTodayMs && t < endOfTodayMs
  }).length
  const shipsThisWeek = open.filter((o) => {
    const t = Date.parse(o.projected_ship_at)
    return t >= startOfTodayMs && t < sevenDaysMs
  }).length

  return res.json({
    summary: {
      pipeline_orders: open.length,
      pipeline_work_days: Math.round(pipelineWorkDays * 10) / 10,
      throughput_per_day: Math.round(throughputPerDay * 100) / 100,
      shipped_last_30_days: shippedLast30,
      days_of_work_in_pipeline:
        daysOfWorkInPipeline === null
          ? null
          : Math.round(daysOfWorkInPipeline * 10) / 10,
      capacity_status: capacityStatus,
      ships_today: shipsToday,
      ships_this_week: shipsThisWeek,
    },
    stage_load: NON_TERMINAL_STAGES.map((stage) => ({
      stage,
      count: stageLoadCounts.get(stage) ?? 0,
      sla_days: STAGE_SLA_DAYS[stage],
    })),
    projected_ships_by_week: projectedShipsByWeek.slice(0, 12),
    open_orders: open.slice(0, 100),
  })
}

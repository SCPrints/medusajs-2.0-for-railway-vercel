import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { studioDate, studioDayStart } from "../../../../lib/business-days"
import {
  PRODUCTION_STAGES,
  STAGE_SLA_DAYS,
  type ProductionStage,
} from "../../../../lib/production-stage"
import {
  isNotProceeding,
  isOpenUnshipped,
  itemMethod,
  loadOrdersOr500,
  matchesRegion,
  parseRegionFilter,
  projectedShipDate,
  shippedAt,
  stageHistory,
  workDaysToShip,
  type DecorationMethod,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/capacity
 *
 * Operational forecast view: how much work is in the pipeline right now,
 * what's the recent throughput, and when will each open order ship?
 *
 * Methodology:
 *   - Pipeline = orders production hasn't shipped yet.
 *   - Per-order projected ship date = its production_due_date, else an
 *     estimate from the production-track SLAs left before shipping.
 *   - Throughput = orders that reached shipped in the last 30 days / 30.
 *     Capacity status is open orders / throughput_per_day.
 *   - "This week's ships" = due in the next 7 days, or already overdue.
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
  // ---- Throughput: orders that reached "shipped" in last 30 days ----
  const thirtyDaysAgo = now - 30 * 86_400_000
  let shippedLast30 = 0
  for (const o of orders) {
    if (!matchesRegion(o, regionFilter)) continue
    if (isNotProceeding(o)) continue
    const at = shippedAt(o)
    if (at && Date.parse(at) >= thirtyDaysAgo) shippedLast30 += 1
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
    if (!isOpenUnshipped(order)) continue
    const meta = (order?.metadata ?? {}) as Record<string, unknown>
    const currentStage = meta.production_stage as ProductionStage
    const entered = stageHistory(order)
      .filter((e) => e.stage === currentStage)
      .pop()?.changed_at
    const daysAtCurrent = entered ? Math.max(0, (now - Date.parse(entered)) / 86_400_000) : 0

    const workDaysRemaining = workDaysToShip(order, now)
    pipelineWorkDays += workDaysRemaining
    stageLoadCounts.set(
      currentStage,
      (stageLoadCounts.get(currentStage) ?? 0) + 1
    )

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
      projected_ship_at: studioDayStart(projectedShipDate(order, now)).toISOString(),
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

  // Capacity health: how many days would the open jobs take at the rate we
  // have been finishing them? Same formula as the capacity_red alert.
  const daysOfWorkInPipeline =
    throughputPerDay > 0 ? open.length / throughputPerDay : null
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
    // Weeks start Monday, on the studio's calendar.
    const d = new Date(`${studioDate(new Date(t))}T00:00:00Z`)
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

  // "Today" / "this week" quick counters, in studio dates. Overdue jobs still
  // have to go out, so they count towards the week.
  const today = studioDate(new Date(now))
  const weekEnd = studioDate(new Date(now + 6 * 86_400_000))
  const shipDates = open.map((o) => studioDate(new Date(o.projected_ship_at)))
  const shipsToday = shipDates.filter((d) => d === today).length
  const shipsThisWeek = shipDates.filter((d) => d <= weekEnd).length

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

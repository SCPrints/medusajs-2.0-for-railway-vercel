import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  type ProductionStage,
} from "../../../../lib/production-stage"
import {
  inRange,
  isNotProceeding,
  itemMethod,
  loadOrdersOr500,
  matchesRegion,
  parseDateRange,
  parseRegionFilter,
  stageTransitions,
  type DecorationMethod,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/reprint-rate
 *
 * A "reprint" is detected as a stage rollback: a move backwards WITHIN ONE
 * TRACK. e.g. `quality_check → in_production` means QC found a defect; an
 * artwork-track rollback is a re-proof. Same rule as the reprint alert in
 * services/report-alerts/evaluate.ts.
 *
 * Reports:
 *   - Total reprints in window + reprint rate (reprints / orders shipped)
 *   - Breakdown by source stage (where rollbacks originate — usually
 *     quality_check or shipped)
 *   - Breakdown by decoration method (which technique fails most)
 *   - Orders flagged with vectorization_for_order get tagged so we can
 *     test whether vectorized artwork reduces reprints over time
 *   - Order list (top 50 by recency) for follow-up
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const { from, to } = parseDateRange(req.query as Record<string, unknown>)
  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const orders = await loadOrdersOr500(query, res, logger, "reprint-rate")
  if (!orders) return

  type RollbackEvent = {
    order_id: string
    display_id: number | null
    rolled_back_at: string
    from_stage: ProductionStage
    to_stage: ProductionStage
    methods: DecorationMethod[]
    had_vectorization: boolean
    customer_email: string | null
  }

  const events: RollbackEvent[] = []
  let ordersInWindow = 0
  // For rate: ratio against orders that have any production_stage_history
  // recorded in the window (i.e. were actively worked on).
  for (const order of orders) {
    if (!matchesRegion(order, regionFilter)) continue
    if (isNotProceeding(order)) continue
    const transitions = stageTransitions(order)
    if (transitions.some((t) => inRange(t.exited_at, from, to))) ordersInWindow += 1

    for (const t of transitions) {
      if (!t.rollback || !inRange(t.exited_at, from, to)) continue

      const items = (order.items ?? []) as any[]
      const methods = Array.from(
        new Set(items.map((it) => itemMethod(it)))
      )
      const hadVectorization = items.some((it) => {
        const m = it?.metadata
        return (
          m && typeof m === "object" && (m as any).vectorization_for_order === true
        )
      })

      events.push({
        order_id: order.id,
        display_id:
          typeof order.display_id === "number" ? order.display_id : null,
        rolled_back_at: t.exited_at,
        from_stage: t.from_stage,
        to_stage: t.to_stage,
        methods,
        had_vectorization: hadVectorization,
        customer_email:
          typeof order.email === "string" ? order.email : null,
      })
    }
  }

  // Aggregations
  const byFromStage = new Map<ProductionStage, number>()
  const byMethod = new Map<DecorationMethod, number>()
  let withVectorization = 0
  for (const e of events) {
    byFromStage.set(e.from_stage, (byFromStage.get(e.from_stage) ?? 0) + 1)
    for (const m of e.methods) {
      byMethod.set(m, (byMethod.get(m) ?? 0) + 1)
    }
    if (e.had_vectorization) withVectorization += 1
  }

  const rolledBackOrderIds = new Set(events.map((e) => e.order_id))
  const reprintRate =
    ordersInWindow > 0 ? rolledBackOrderIds.size / ordersInWindow : 0

  events.sort(
    (a, b) => Date.parse(b.rolled_back_at) - Date.parse(a.rolled_back_at)
  )

  return res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    summary: {
      total_rollbacks: events.length,
      affected_orders: rolledBackOrderIds.size,
      orders_worked: ordersInWindow,
      reprint_rate_pct: Math.round(reprintRate * 1000) / 10,
      with_vectorization: withVectorization,
    },
    by_source_stage: Array.from(byFromStage.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),
    by_method: Array.from(byMethod.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count),
    recent_events: events.slice(0, 50),
  })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  PRODUCTION_STAGES,
  type ProductionStage,
} from "../../../../lib/production-stage"
import {
  inRange,
  isNotProceeding,
  loadOrdersOr500,
  matchesRegion,
  parseDateRange,
  parseRegionFilter,
  stageHistory,
  stageTransitions,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/order-edit-frequency
 *
 * Process-maturity proxy: how many stage transitions does the average
 * order go through, counted within each track? A clean run is 9 (artwork 3,
 * blanks 2, production 4); more = revisions / rollbacks.
 *
 * Specifically tracks:
 *   - avg_transitions_per_order — across all orders that completed a
 *     stage walk in the window (i.e. their *exit* from any stage fell
 *     in window).
 *   - rollback_rate_pct — % of those transitions that went backwards.
 *   - high_edit_orders — top 20 orders by transition count, surface
 *     for staff review (often staff fixed something multiple times).
 *
 * Trending up over time = onboarding new customers who don't get the
 * brief. Trending down = your PDPs / customizer are getting clearer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const { from, to } = parseDateRange(req.query as Record<string, unknown>)
  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const orders = await loadOrdersOr500(query, res, logger, "order-edit-frequency")
  if (!orders) return

  type OrderStat = {
    order_id: string
    display_id: number | null
    transitions: number
    rollbacks: number
    customer_email: string | null
    final_stage: ProductionStage | null
  }
  const stats: OrderStat[] = []
  let totalTransitions = 0
  let totalRollbacks = 0

  for (const o of orders) {
    if (!matchesRegion(o, regionFilter)) continue
    if (isNotProceeding(o)) continue
    const inWindow = stageTransitions(o).filter((t) => inRange(t.exited_at, from, to))
    const transitionsInWindow = inWindow.length
    const rollbacksInWindow = inWindow.filter((t) => t.rollback).length
    if (transitionsInWindow === 0) continue

    totalTransitions += transitionsInWindow
    totalRollbacks += rollbacksInWindow

    const finalStage = stageHistory(o).pop()?.stage
    stats.push({
      order_id: o.id,
      display_id: typeof o.display_id === "number" ? o.display_id : null,
      transitions: transitionsInWindow,
      rollbacks: rollbacksInWindow,
      customer_email: typeof o.email === "string" ? o.email : null,
      final_stage:
        finalStage && (PRODUCTION_STAGES as readonly string[]).includes(finalStage)
          ? finalStage
          : null,
    })
  }

  const ordersTouched = stats.length
  const avgTransitions =
    ordersTouched > 0 ? totalTransitions / ordersTouched : 0
  const rollbackRate =
    totalTransitions > 0 ? (totalRollbacks / totalTransitions) * 100 : 0

  // Distribution: how many orders had 1-2 transitions, 3-5, 6-9, 10+?
  const buckets = [
    { range: "1-2", min: 1, max: 2, count: 0 },
    { range: "3-5", min: 3, max: 5, count: 0 },
    { range: "6-9", min: 6, max: 9, count: 0 },
    { range: "10+", min: 10, max: Infinity, count: 0 },
  ]
  for (const s of stats) {
    for (const b of buckets) {
      if (s.transitions >= b.min && s.transitions <= b.max) {
        b.count += 1
        break
      }
    }
  }

  const highEditOrders = [...stats]
    .sort((a, b) => b.transitions - a.transitions)
    .slice(0, 20)

  return res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    summary: {
      orders_touched: ordersTouched,
      total_transitions: totalTransitions,
      avg_transitions_per_order: Math.round(avgTransitions * 10) / 10,
      total_rollbacks: totalRollbacks,
      rollback_rate_pct: Math.round(rollbackRate * 10) / 10,
    },
    distribution: buckets,
    high_edit_orders: highEditOrders,
  })
}

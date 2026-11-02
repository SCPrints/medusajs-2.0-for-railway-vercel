import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCTION_STAGES } from "../../../../lib/production-stage"
import {
  computeStageDwellDays,
  type DecorationMethod,
  inRange,
  isNotProceeding,
  isDecorationMethodOrBlank,
  itemMethod,
  loadOrdersOr500,
  matchesRegion,
  parseDateRange,
  parseRegionFilter,
  summarise,
  TERMINAL_STAGES,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/time-in-stage
 *
 * Per-stage median and p90 dwell time (in days) computed from
 * `metadata.production_stage_history`. Includes only orders whose
 * dwell on the given stage *completed* within the date window —
 * i.e. the order has since left that stage. The current stage is
 * excluded because its dwell isn't final.
 *
 * Filters: from/to (defaults: last 30 days), method (csv).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const { from, to } = parseDateRange(req.query as Record<string, unknown>)
  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const rawMethods = (req.query.method as string | undefined)?.trim()
  const methodFilter = rawMethods
    ? new Set(
        rawMethods
          .split(",")
          .map((m) => m.trim())
          .filter((m): m is DecorationMethod => isDecorationMethodOrBlank(m))
      )
    : null

  const orders = await loadOrdersOr500(query, res, logger, "time-in-stage")
  if (!orders) return

  // Bucket: stage -> [dwell_days_for_each_completed_pass]
  const buckets = new Map<string, number[]>()
  for (const stage of PRODUCTION_STAGES) buckets.set(stage, [])

  for (const order of orders) {
    if (!matchesRegion(order, regionFilter)) continue
    if (isNotProceeding(order)) continue
    if (methodFilter && methodFilter.size) {
      const lineMethods = (order.items ?? []).map((it: any) => itemMethod(it))
      const matches = lineMethods.some((m: DecorationMethod) => methodFilter.has(m))
      if (!matches) continue
    }

    for (const dwell of computeStageDwellDays(order)) {
      if (!inRange(dwell.exited_at, from, to)) continue
      buckets.get(dwell.stage)?.push(dwell.days)
    }
  }

  const stages = PRODUCTION_STAGES.filter((s) => !TERMINAL_STAGES.has(s)).map((stage) => {
    const values = buckets.get(stage) ?? []
    const summary = summarise(values)
    return {
      stage,
      sample_size: values.length,
      median_days: summary.median,
      p90_days: summary.p90,
    }
  })

  return res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    stages,
  })
}

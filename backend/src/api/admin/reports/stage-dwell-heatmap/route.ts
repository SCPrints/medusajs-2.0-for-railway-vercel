import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCTION_STAGES, STAGE_SLA_DAYS } from "../../../../lib/production-stage"
import {
  buildWeekBuckets,
  computeStageDwellDays,
  inRange,
  isNotProceeding,
  loadOrdersOr500,
  matchesRegion,
  parseDateRange,
  parseRegionFilter,
  TERMINAL_STAGES,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/stage-dwell-heatmap
 *
 * Returns a (stage × week) matrix where each cell is the average dwell
 * time (in days) for orders that *exited* that stage during that week.
 * Also returns each cell's SLA health band ("ok" | "warn" | "breach")
 * so the frontend can colour-code without re-implementing the threshold logic.
 *
 * Filters: from/to (defaults: last 30 days), region_id.
 */

type Health = "ok" | "warn" | "breach" | "none"

function healthBand(avgDays: number, slaDays: number | null | undefined): Health {
  if (!slaDays) return "none"
  if (avgDays <= slaDays * 0.8) return "ok"
  if (avgDays <= slaDays) return "warn"
  return "breach"
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const { from, to } = parseDateRange(req.query as Record<string, unknown>)
  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const orders = await loadOrdersOr500(query, res, logger, "stage-dwell-heatmap")
  if (!orders) return

  const { buckets, findBucket } = buildWeekBuckets(from, to)

  // (stage, weekIndex) → [dwell_days]
  const matrix = new Map<string, number[][]>(
    PRODUCTION_STAGES.map((stage) => [stage, buckets.map(() => [])])
  )

  for (const order of orders) {
    if (!matchesRegion(order, regionFilter)) continue
    if (isNotProceeding(order)) continue

    for (const dwell of computeStageDwellDays(order)) {
      if (!inRange(dwell.exited_at, from, to)) continue
      const weekIdx = findBucket(dwell.exited_at)
      if (weekIdx < 0) continue
      const stageMatrix = matrix.get(dwell.stage)
      if (stageMatrix) stageMatrix[weekIdx].push(dwell.days)
    }
  }

  const weeks = buckets.map((b) => b.label)

  const stages = PRODUCTION_STAGES.filter((s) => !TERMINAL_STAGES.has(s)).map((stage) => {
    const stageMatrix = matrix.get(stage) ?? []
    const sla = STAGE_SLA_DAYS[stage]
    const weekCells = stageMatrix.map((values, wi) => {
      const count = values.length
      const avgDays =
        count === 0
          ? null
          : Math.round((values.reduce((s, v) => s + v, 0) / count) * 10) / 10
      return {
        week: weeks[wi],
        count,
        avg_days: avgDays,
        health: avgDays !== null ? healthBand(avgDays, sla) : ("none" as Health),
      }
    })
    return { stage, sla_days: sla ?? null, weeks: weekCells }
  })

  return res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    weeks,
    stages,
  })
}

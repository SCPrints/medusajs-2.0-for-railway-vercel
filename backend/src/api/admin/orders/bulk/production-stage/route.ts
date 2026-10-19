import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  IEventBusModuleService,
  IOrderModuleService,
} from "@medusajs/framework/types"

import {
  isDownstreamStage,
  isProductionStage,
  planProductionStageChange,
  resolveTracksFromMeta,
  type ProductionStage,
} from "../../../../../lib/production-stage"
import { isTransitionNotAllowed } from "../../../../../lib/production-stage-guard"
import { getPostHog } from "../../../../../lib/posthog"
import { isDecoratedLine, productionGateFailures } from "../../../../../lib/production-gate"

/**
 * POST /admin/orders/bulk/production-stage
 *   { order_ids: string[], stage: ProductionStage, note?: string }
 *
 * Move N orders to the same stage in one shot. Each order is planned through
 * `planProductionStageChange` — the same planner the automation action uses —
 * so the target routes to its track, the same-value check compares against
 * the TRACK value (not the overloaded `production_stage` field: an order whose
 * artwork is already awaiting_approval but whose last transition was blanks
 * "ordered" used to get a duplicate history entry, a reset
 * artwork_stage_changed_at and a second proof email — review 3-7), and the
 * state-machine guard runs as `bulk` with no override path. Events are
 * emitted per actually-changed order so subscribers (emails, audit log,
 * alerts) all fire correctly.
 *
 * Caps at 200 orders per call.
 */
const MAX_BATCH = 200

type ResultRow = {
  order_id: string
  changed: boolean
  from_stage: ProductionStage | null
  to_stage: ProductionStage
  error?: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as any
  if (!Array.isArray(body.order_ids) || body.order_ids.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "order_ids must be a non-empty array"
    )
  }
  if (body.order_ids.length > MAX_BATCH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Batch too large (${body.order_ids.length}). Max ${MAX_BATCH} per call.`
    )
  }
  if (!isProductionStage(body.stage)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid stage: ${body.stage}`
    )
  }
  const note: string | null =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null

  const orderModuleService = req.scope.resolve<IOrderModuleService>(Modules.ORDER)
  const eventBus = req.scope.resolve<IEventBusModuleService>(Modules.EVENT_BUS)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const changedAt = new Date().toISOString()
  const changedBy =
    (req as any).auth_context?.actor_id ??
    (req as any).auth_context?.app_metadata?.user_id ??
    null

  const toStage = body.stage as ProductionStage
  const results: ResultRow[] = []
  for (const orderId of body.order_ids as string[]) {
    if (typeof orderId !== "string" || orderId.length === 0) {
      results.push({
        order_id: String(orderId),
        changed: false,
        from_stage: null,
        to_stage: toStage,
        error: "invalid order id",
      })
      continue
    }
    let order: any
    try {
      order = await orderModuleService.retrieveOrder(orderId, { relations: ["items"] })
    } catch (err: any) {
      results.push({
        order_id: orderId,
        changed: false,
        from_stage: null,
        to_stage: toStage,
        error: `not found`,
      })
      continue
    }

    const meta = (order.metadata ?? {}) as Record<string, unknown>
    const tracks = resolveTracksFromMeta(meta)

    let plan: ReturnType<typeof planProductionStageChange>
    try {
      plan = planProductionStageChange(
        meta,
        { stage: toStage },
        { orderId, changedAt, changedBy, note, actor: { kind: "bulk", user_id: changedBy } }
      )
    } catch (err: any) {
      results.push({
        order_id: orderId,
        changed: false,
        from_stage: tracks.downstream,
        to_stage: toStage,
        error: isTransitionNotAllowed(err)
          ? `${err.message}. Open the order to force it with a reason.`
          : `plan failed: ${err?.message ?? err}`,
      })
      continue
    }

    // The planner reports which track moved; "from" is that track's value.
    const moved = plan.events[0]?.data
    const fromStage: ProductionStage | null = moved?.from_stage ?? null

    if (!plan.changed || !plan.metadata) {
      results.push({
        order_id: orderId,
        changed: false,
        from_stage: fromStage,
        to_stage: toStage,
      })
      continue
    }

    // Same readiness check as the single-order route. Bulk moves can't
    // override it: open the order and start it there with a reason.
    if (isDownstreamStage(toStage)) {
      const failures = productionGateFailures({
        meta,
        fromDownstream: tracks.downstream,
        toDownstream: toStage,
        artwork: plan.metadata.artwork_stage,
        blanks: plan.metadata.blanks_stage,
        hasDecoratedLines: (order.items ?? []).some(isDecoratedLine),
      })
      if (failures.length > 0) {
        results.push({
          order_id: orderId,
          changed: false,
          from_stage: fromStage,
          to_stage: toStage,
          error: `Not ready for production: ${failures.join("; ")}`,
        })
        continue
      }
    }

    // Stage move = progress; clear any stale flag immediately.
    const {
      is_stale: _isStale,
      stale_since: _staleSince,
      stale_track: _staleTrack,
      stale_stage: _staleStage,
      stale_stage_since: _staleStageSince,
      ...freshMeta
    } = meta as Record<string, unknown>

    try {
      await orderModuleService.updateOrders(orderId, {
        metadata: { ...freshMeta, ...plan.metadata },
      })
    } catch (err: any) {
      results.push({
        order_id: orderId,
        changed: false,
        from_stage: fromStage,
        to_stage: toStage,
        error: `update failed: ${err?.message ?? err}`,
      })
      continue
    }

    for (const e of plan.events) {
      try {
        await eventBus.emit({ name: e.name, data: e.data })
      } catch (err: any) {
        logger.warn?.(
          `bulk-production-stage: failed to emit event for ${orderId}: ${err?.message ?? err}`
        )
      }
    }
    results.push({
      order_id: orderId,
      changed: true,
      from_stage: fromStage,
      to_stage: toStage,
    })
  }

  const changedCount = results.filter((r) => r.changed).length
  const skippedCount = results.filter((r) => !r.changed && !r.error).length
  const failedCount = results.filter((r) => Boolean(r.error)).length

  if (changedCount > 0) {
    const adminId = changedBy ?? "admin"
    getPostHog()?.capture({
      distinctId: adminId,
      event: "bulk production stage changed",
      properties: {
        to_stage: toStage,
        requested: body.order_ids.length,
        changed: changedCount,
        skipped: skippedCount,
        failed: failedCount,
        has_note: Boolean(note),
      },
    })
  }

  return res.json({
    requested: body.order_ids.length,
    changed: changedCount,
    skipped: skippedCount,
    failed: failedCount,
    results,
  })
}

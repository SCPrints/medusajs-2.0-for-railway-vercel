import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { mergeOrderMetadata } from "./order-metadata"
import { planProductionStageChange, resolveTracksFromMeta, STALE_FLAG_KEYS } from "./production-stage"
import { emitStageEvents } from "./stage-events"

/**
 * A supplier order for the blanks went out (AS Colour / Aussie Pacific
 * dropship): move the Blanks track to "ordered" the same way a staff stage
 * change does — history entry, stage event, stale flags cleared. Only from
 * "not_started"; a track already ordered or arrived is left alone.
 *
 * Best-effort: the supplier order is already placed, so a failure here is
 * logged, never thrown.
 */
export async function markBlanksOrdered(
  container: MedusaContainer,
  orderId: string,
  opts: { actor: string | null; note: string }
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const order = await (container.resolve(Modules.ORDER) as any).retrieveOrder(orderId)
    const meta = (order.metadata ?? {}) as Record<string, unknown>
    if (resolveTracksFromMeta(meta).blanks !== "not_started") return

    const plan = planProductionStageChange(
      meta,
      { blanks_stage: "ordered" },
      {
        orderId,
        changedAt: new Date().toISOString(),
        changedBy: opts.actor ?? "system",
        note: opts.note,
        actor: { kind: "admin", user_id: opts.actor },
      }
    )
    if (!plan.changed || !plan.metadata) return

    const { production_stage_history: _history, ...patch } = plan.metadata
    await mergeOrderMetadata(container, orderId, patch, {
      append: { production_stage_history: plan.historyEntries },
      unset: [...STALE_FLAG_KEYS],
    })
    await emitStageEvents(container, orderId, plan.events)
  } catch (err: any) {
    logger.warn(`markBlanksOrdered(${orderId}): ${err?.message ?? err}`)
  }
}

import type { IEventBusModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { AUDIT_ACTION, AUDIT_ENTITY } from "./audit-entities"
import { writeAudit } from "./audit-log"
import { mergeOrderMetadata } from "./order-metadata"
import type { ProductionStageChangedEvent } from "./production-stage"

export type StageEvent = { name: string; data: ProductionStageChangedEvent }

/** Where an undelivered stage event waits for the drain cron. */
export const PENDING_STAGE_EVENTS_KEY = "pending_stage_events"

/**
 * Emit the stage events a writer produced AFTER its metadata write landed.
 * The write and the emit aren't one transaction, so a Redis blip here used
 * to mean "stage says the proof was sent; no email, no audit, no fulfilment,
 * and nothing told staff" (review 3-10). An event that fails to emit now
 * lands on `metadata.pending_stage_events` (atomic append) with an audit
 * row, and `jobs/drain-pending-stage-events` re-emits it. Never throws —
 * the stage change the caller already committed to must not 500.
 */
export async function emitStageEvents(
  container: MedusaContainer,
  orderId: string,
  events: StageEvent[]
): Promise<{ failed: number }> {
  if (events.length === 0) return { failed: 0 }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  let eventBus: IEventBusModuleService | null = null
  try {
    eventBus = container.resolve(Modules.EVENT_BUS) as IEventBusModuleService
  } catch {
    eventBus = null
  }

  let failed = 0
  for (const e of events) {
    try {
      if (!eventBus) throw new Error("event bus not registered")
      await eventBus.emit({ name: e.name, data: e.data })
    } catch (err: any) {
      failed += 1
      logger.error(
        `stage-events: failed to emit ${e.name} for order ${orderId}: ${err?.message ?? err} — queued for the drain job`
      )
      try {
        await mergeOrderMetadata(container, orderId, {}, { append: { [PENDING_STAGE_EVENTS_KEY]: [e] } })
      } catch (queueErr: any) {
        logger.error(
          `stage-events: could not queue ${e.name} for order ${orderId}: ${queueErr?.message ?? queueErr}`
        )
      }
      await writeAudit({
        container,
        entity: AUDIT_ENTITY.ORDER,
        entity_id: orderId,
        action: AUDIT_ACTION.STAGE_EVENT_EMIT_FAILED,
        actor_id: e.data.changed_by ?? null,
        details: { event: e.name, to_stage: e.data.to_stage, track: e.data.track ?? null, error: String(err?.message ?? err) },
      })
    }
  }
  return { failed }
}

/**
 * Atomically take every queued stage event (set the array to [] in the same
 * statement that reads it) and re-emit. Events that fail again re-queue
 * through emitStageEvents.
 */
export async function drainPendingStageEvents(
  container: MedusaContainer
): Promise<{ orders: number; emitted: number; failed: number }> {
  const pg = container.resolve<any>("__pg_connection__")
  const { rows } = await pg.raw(
    `update "order"
        set metadata = metadata || '{"${PENDING_STAGE_EVENTS_KEY}":[]}'::jsonb
      where jsonb_typeof(metadata->'${PENDING_STAGE_EVENTS_KEY}') = 'array'
        and jsonb_array_length(metadata->'${PENDING_STAGE_EVENTS_KEY}') > 0
      returning id, metadata->'${PENDING_STAGE_EVENTS_KEY}' as events`
  )
  let emitted = 0
  let failed = 0
  for (const row of (rows ?? []) as Array<{ id: string; events: unknown }>) {
    const events = (Array.isArray(row.events) ? row.events : []).filter(
      (e): e is StageEvent => !!e && typeof e === "object" && typeof (e as StageEvent).name === "string"
    )
    const result = await emitStageEvents(container, row.id, events)
    failed += result.failed
    emitted += events.length - result.failed
  }
  return { orders: rows?.length ?? 0, emitted, failed }
}

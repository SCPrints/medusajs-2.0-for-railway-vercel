import type { ProductionStageChangedEvent, ProductionTrack } from "./production-stage"

/**
 * The audit_log `details` row for a stage-changed event, any track. Pure so
 * the subscriber stays a one-liner and the shape is unit-tested. `track`
 * falls back to the stage's own track for events emitted without it (the
 * customer approval route before 3-8).
 */
export function stageAuditDetails(
  data: ProductionStageChangedEvent,
  fallbackTrack: ProductionTrack
): {
  track: ProductionTrack
  from_stage: string | null
  to_stage: string
  note: string | null
  changed_at: string
} {
  return {
    track: data.track ?? fallbackTrack,
    from_stage: data.from_stage ?? null,
    to_stage: data.to_stage,
    note: data.note ?? null,
    changed_at: data.changed_at,
  }
}

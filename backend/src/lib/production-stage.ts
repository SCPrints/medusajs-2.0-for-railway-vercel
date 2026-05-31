/**
 * SYNC TARGET: storefront/src/modules/order/lib/production-stage.ts
 *
 * Backend = canonical source. Mirror any change to the storefront file and run
 * `scripts/check-production-stage-sync.mjs` to enforce parity.
 *
 * Production tracking runs on **three** independent threads after an order is
 * received:
 *
 *   received
 *      ├─ Artwork track:  pending → in_review → awaiting_approval → approved
 *      ├─ Blanks track:   not_started → ordered → arrived
 *      └─ Production:     received → in_production → quality_check → shipped → delivered
 *
 * Artwork chase and blanks PO happen in parallel — the shop wants to order
 * stock the moment payment clears, without waiting on approval (which can
 * drag on for weeks). Staff can advance any track in any order; nothing is
 * hard-gated.
 *
 * Customers see one "Preparing" milestone collapsing both prep tracks, with
 * the two mini-tracks rendered side-by-side underneath.
 *
 * `PRODUCTION_STAGES` (below) is the **union of every stage value** that can
 * appear in `production_stage_history`. The narrower track-specific arrays
 * (`ARTWORK_STAGES`, `BLANKS_STAGES`, `DOWNSTREAM_STAGES`) are the allowed
 * write sets for each track field.
 */

export const ARTWORK_STAGES = [
  "pending",
  "in_review",
  "awaiting_approval",
  "approved",
] as const

export type ArtworkStage = (typeof ARTWORK_STAGES)[number]

export const ARTWORK_STAGE_LABEL: Record<ArtworkStage, string> = {
  pending: "Artwork not started",
  in_review: "Artwork review",
  awaiting_approval: "Awaiting your approval",
  approved: "Artwork approved",
}

export const BLANKS_STAGES = [
  "not_started",
  "ordered",
  "arrived",
] as const

export type BlanksStage = (typeof BLANKS_STAGES)[number]

export const BLANKS_STAGE_LABEL: Record<BlanksStage, string> = {
  not_started: "Blanks not ordered",
  ordered: "Blanks ordered",
  arrived: "Blanks received",
}

export const DOWNSTREAM_STAGES = [
  "received",
  "in_production",
  "quality_check",
  "shipped",
  "delivered",
] as const

export type DownstreamStage = (typeof DOWNSTREAM_STAGES)[number]

export const DOWNSTREAM_STAGE_LABEL: Record<DownstreamStage, string> = {
  received: "Order received",
  in_production: "In production",
  quality_check: "Quality check",
  shipped: "Shipped",
  delivered: "Delivered",
}

/**
 * Union of every stage value that can appear in `production_stage_history`.
 * Kept as a flat list (legacy stages + new track stages) so reports and other
 * history consumers continue to type-check.
 */
export const PRODUCTION_STAGES = [
  "received",
  "in_production",
  "quality_check",
  "shipped",
  "delivered",
  "pending",
  "in_review",
  "awaiting_approval",
  "approved",
  "not_started",
  "ordered",
  "arrived",
  "art_review",
  "blanks_ordered",
  "blanks_arrived",
] as const

export type ProductionStage = (typeof PRODUCTION_STAGES)[number]

export const PRODUCTION_STAGE_LABEL: Record<ProductionStage, string> = {
  received: "Order received",
  in_production: "In production",
  quality_check: "Quality check",
  shipped: "Shipped",
  delivered: "Delivered",
  pending: "Artwork not started",
  in_review: "Artwork review",
  awaiting_approval: "Awaiting your approval",
  approved: "Artwork approved",
  not_started: "Blanks not ordered",
  ordered: "Blanks ordered",
  arrived: "Blanks received",
  // legacy
  art_review: "Artwork review",
  blanks_ordered: "Blanks ordered",
  blanks_arrived: "Blanks received",
}

export type ProductionTrack = "artwork" | "blanks" | "production"

export type CustomerMilestone =
  | "received"
  | "preparing"
  | "production"
  | "shipped"
  | "delivered"

export const CUSTOMER_MILESTONES: CustomerMilestone[] = [
  "received",
  "preparing",
  "production",
  "shipped",
  "delivered",
]

export const CUSTOMER_MILESTONE_LABEL: Record<CustomerMilestone, string> = {
  received: "Order received",
  preparing: "Preparing your order",
  production: "In production",
  shipped: "Shipped",
  delivered: "Delivered",
}

/**
 * Maps a history-entry stage value back to the customer-facing milestone it
 * belongs to. Used for legacy reads and any place that still needs a single
 * customer milestone for a single stage value.
 */
export function customerMilestoneForStage(stage: ProductionStage): CustomerMilestone {
  switch (stage) {
    case "received":
      return "received"
    // artwork track
    case "pending":
    case "in_review":
    case "awaiting_approval":
    case "approved":
    case "art_review":
      return "preparing"
    // blanks track
    case "not_started":
    case "ordered":
    case "arrived":
    case "blanks_ordered":
    case "blanks_arrived":
      return "preparing"
    case "in_production":
    case "quality_check":
      return "production"
    case "shipped":
      return "shipped"
    case "delivered":
      return "delivered"
  }
}

/**
 * Pre-split orders only have `metadata.production_stage`. Read that and
 * derive what the two new track fields should be, so the widget, tracker,
 * and dashboard can present legacy orders without a DB migration. Callers
 * that take a write should persist the derived values back so subsequent
 * reads don't keep re-deriving.
 */
export type DerivedTracks = {
  artwork_stage: ArtworkStage
  blanks_stage: BlanksStage
  production_stage: DownstreamStage
}

export function deriveTracksFromLegacyStage(stage: ProductionStage | null | undefined): DerivedTracks {
  switch (stage) {
    case "received":
    case null:
    case undefined:
      return { artwork_stage: "pending", blanks_stage: "not_started", production_stage: "received" }
    case "art_review":
    case "in_review":
      return { artwork_stage: "in_review", blanks_stage: "not_started", production_stage: "received" }
    case "awaiting_approval":
      return { artwork_stage: "awaiting_approval", blanks_stage: "not_started", production_stage: "received" }
    case "approved":
      return { artwork_stage: "approved", blanks_stage: "not_started", production_stage: "received" }
    case "blanks_ordered":
    case "ordered":
      return { artwork_stage: "approved", blanks_stage: "ordered", production_stage: "received" }
    case "blanks_arrived":
    case "arrived":
      return { artwork_stage: "approved", blanks_stage: "arrived", production_stage: "received" }
    case "in_production":
      return { artwork_stage: "approved", blanks_stage: "arrived", production_stage: "in_production" }
    case "quality_check":
      return { artwork_stage: "approved", blanks_stage: "arrived", production_stage: "quality_check" }
    case "shipped":
      return { artwork_stage: "approved", blanks_stage: "arrived", production_stage: "shipped" }
    case "delivered":
      return { artwork_stage: "approved", blanks_stage: "arrived", production_stage: "delivered" }
    // standalone artwork/blanks track values that found their way here
    case "pending":
      return { artwork_stage: "pending", blanks_stage: "not_started", production_stage: "received" }
    case "not_started":
      return { artwork_stage: "pending", blanks_stage: "not_started", production_stage: "received" }
  }
}

/** Artwork track stages that fire a customer email on entry. */
export const ARTWORK_STAGES_THAT_EMAIL: ReadonlySet<ArtworkStage> = new Set<ArtworkStage>([
  "awaiting_approval",
])

/** Blanks track is internal-only — customers don't get notified about PO state. */
export const BLANKS_STAGES_THAT_EMAIL: ReadonlySet<BlanksStage> = new Set<BlanksStage>([])

/** Downstream stages that fire a customer email on entry. */
export const DOWNSTREAM_STAGES_THAT_EMAIL: ReadonlySet<DownstreamStage> = new Set<DownstreamStage>([
  "in_production",
])

/**
 * Legacy union for any code that still consults a flat set. Treat as
 * deprecated — prefer the track-specific sets above.
 */
export const STAGES_THAT_EMAIL: ReadonlySet<ProductionStage> = new Set<ProductionStage>([
  "awaiting_approval",
  "in_production",
])

/** SLA defaults (days) by stage. `null` = terminal, no SLA. */
export const ARTWORK_STAGE_SLA_DAYS: Record<ArtworkStage, number | null> = {
  pending: 1,
  in_review: 1,
  awaiting_approval: 2,
  approved: null,
}

export const BLANKS_STAGE_SLA_DAYS: Record<BlanksStage, number | null> = {
  not_started: 1,
  ordered: 5,
  arrived: null,
}

export const DOWNSTREAM_STAGE_SLA_DAYS: Record<DownstreamStage, number | null> = {
  received: 1,
  in_production: 3,
  quality_check: 1,
  shipped: 7,
  delivered: null,
}

/**
 * Legacy unified map. Includes track values too so existing reports that
 * look up by raw stage value keep returning a number.
 */
export const STAGE_SLA_DAYS: Record<ProductionStage, number | null> = {
  received: 1,
  in_production: 3,
  quality_check: 1,
  shipped: 7,
  delivered: null,
  pending: 1,
  in_review: 1,
  awaiting_approval: 2,
  approved: null,
  not_started: 1,
  ordered: 5,
  arrived: null,
  // legacy
  art_review: 1,
  blanks_ordered: 5,
  blanks_arrived: 1,
}

function shouldEmailGeneric<T extends string>(
  ordered: readonly T[],
  emailSet: ReadonlySet<T>,
  from: T | null | undefined,
  to: T
): boolean {
  if (!emailSet.has(to)) return false
  if (from === to) return false
  if (from && (ordered as readonly string[]).includes(from)) {
    const fromIdx = ordered.indexOf(from)
    const toIdx = ordered.indexOf(to)
    if (fromIdx >= 0 && toIdx >= 0 && toIdx <= fromIdx) return false
  }
  return true
}

export function shouldEmailForArtworkTransition(
  from: ArtworkStage | null | undefined,
  to: ArtworkStage
): boolean {
  return shouldEmailGeneric(ARTWORK_STAGES, ARTWORK_STAGES_THAT_EMAIL, from, to)
}

export function shouldEmailForBlanksTransition(
  from: BlanksStage | null | undefined,
  to: BlanksStage
): boolean {
  return shouldEmailGeneric(BLANKS_STAGES, BLANKS_STAGES_THAT_EMAIL, from, to)
}

export function shouldEmailForDownstreamTransition(
  from: DownstreamStage | null | undefined,
  to: DownstreamStage
): boolean {
  return shouldEmailGeneric(DOWNSTREAM_STAGES, DOWNSTREAM_STAGES_THAT_EMAIL, from, to)
}

/**
 * Legacy single-stage email decision — kept for any callers that still
 * operate on the flat `production_stage` field. Prefer the track-specific
 * helpers above.
 */
export function shouldEmailForStageTransition(
  from: ProductionStage | null | undefined,
  to: ProductionStage
): boolean {
  return shouldEmailGeneric(PRODUCTION_STAGES, STAGES_THAT_EMAIL, from, to)
}

export function isProductionStage(value: unknown): value is ProductionStage {
  return typeof value === "string" && (PRODUCTION_STAGES as readonly string[]).includes(value)
}

export function isArtworkStage(value: unknown): value is ArtworkStage {
  return typeof value === "string" && (ARTWORK_STAGES as readonly string[]).includes(value)
}

export function isBlanksStage(value: unknown): value is BlanksStage {
  return typeof value === "string" && (BLANKS_STAGES as readonly string[]).includes(value)
}

export function isDownstreamStage(value: unknown): value is DownstreamStage {
  return typeof value === "string" && (DOWNSTREAM_STAGES as readonly string[]).includes(value)
}

export type ProductionStageHistoryEntry = {
  stage: ProductionStage
  changed_at: string
  changed_by?: string | null
  note?: string | null
  /** Which track this transition belongs to. Optional for backward compat with legacy entries. */
  track?: ProductionTrack
}

export type ProductionStageMetadata = {
  production_stage: ProductionStage
  production_stage_changed_at: string
  production_stage_history: ProductionStageHistoryEntry[]
  artwork_stage?: ArtworkStage
  artwork_stage_changed_at?: string
  blanks_stage?: BlanksStage
  blanks_stage_changed_at?: string
}

export const PRODUCTION_STAGE_EVENT = "order.production_stage_changed"
export const ARTWORK_STAGE_EVENT = "order.artwork_stage_changed"
export const BLANKS_STAGE_EVENT = "order.blanks_stage_changed"

/**
 * Returns the next stage WITHIN THE SAME TRACK as `stage`. Used by the
 * production dashboard's "advance" button so dragging an order forward
 * stays inside its track (artwork-only or blanks-only) instead of jumping
 * across tracks via flat-array indexing.
 *
 * Legacy values are mapped to their new-world equivalent first.
 *
 * Returns `null` when the stage is terminal within its track (artwork:
 * approved; blanks: arrived; production: delivered).
 */
export function nextStageInTrack(stage: ProductionStage): ProductionStage | null {
  if (stage === "art_review") return "awaiting_approval"
  if (stage === "blanks_ordered") return "blanks_arrived"
  if (stage === "blanks_arrived") return null

  if (isArtworkStage(stage)) {
    const idx = ARTWORK_STAGES.indexOf(stage)
    return idx >= 0 && idx < ARTWORK_STAGES.length - 1 ? ARTWORK_STAGES[idx + 1] : null
  }
  if (isBlanksStage(stage)) {
    const idx = BLANKS_STAGES.indexOf(stage)
    return idx >= 0 && idx < BLANKS_STAGES.length - 1 ? BLANKS_STAGES[idx + 1] : null
  }
  if (isDownstreamStage(stage)) {
    const idx = DOWNSTREAM_STAGES.indexOf(stage)
    return idx >= 0 && idx < DOWNSTREAM_STAGES.length - 1 ? DOWNSTREAM_STAGES[idx + 1] : null
  }
  return null
}

export type ProductionStageChangedEvent = {
  order_id: string
  from_stage: ProductionStage | null
  to_stage: ProductionStage
  changed_at: string
  changed_by?: string | null
  note?: string | null
  track?: ProductionTrack
}

export type ProductionStageChangeInput = {
  stage?: ProductionStage
  artwork_stage?: ArtworkStage
  blanks_stage?: BlanksStage
  production_stage?: DownstreamStage
}

export type ProductionStageChangePlan = {
  changed: boolean
  /**
   * Metadata fields to merge over the existing `order.metadata`. Null when
   * nothing changed.
   */
  metadata:
    | {
        production_stage: ProductionStage
        production_stage_changed_at: string
        production_stage_history: ProductionStageHistoryEntry[]
        artwork_stage: ArtworkStage
        artwork_stage_changed_at: string | null
        blanks_stage: BlanksStage
        blanks_stage_changed_at: string | null
      }
    | null
  events: Array<{ name: string; data: ProductionStageChangedEvent }>
}

function readStageFromMeta(meta: Record<string, unknown>): ProductionStage | null {
  const raw = (meta as { production_stage?: unknown }).production_stage
  return isProductionStage(raw) ? raw : null
}

function readHistoryFromMeta(
  meta: Record<string, unknown>
): ProductionStageHistoryEntry[] {
  const raw = (meta as { production_stage_history?: unknown })
    .production_stage_history
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is ProductionStageHistoryEntry => {
    if (!entry || typeof entry !== "object") return false
    const stage = (entry as { stage?: unknown }).stage
    const changed_at = (entry as { changed_at?: unknown }).changed_at
    return isProductionStage(stage) && typeof changed_at === "string"
  })
}

/**
 * Resolve the three track stages from an order's metadata, deriving legacy
 * orders that only carry `production_stage`.
 */
export function resolveTracksFromMeta(meta: Record<string, unknown>): {
  artwork: ArtworkStage
  blanks: BlanksStage
  downstream: DownstreamStage
} {
  const m = meta as { artwork_stage?: unknown; blanks_stage?: unknown }
  const current = readStageFromMeta(meta)
  const derived = deriveTracksFromLegacyStage(current)
  return {
    artwork: isArtworkStage(m.artwork_stage)
      ? m.artwork_stage
      : derived.artwork_stage,
    blanks: isBlanksStage(m.blanks_stage)
      ? m.blanks_stage
      : derived.blanks_stage,
    downstream: isDownstreamStage(current)
      ? (current as DownstreamStage)
      : derived.production_stage,
  }
}

/**
 * Pure planner for a production-stage change. Mirrors the admin
 * `POST /orders/:id/production-stage` route so EVERY caller (that route, the
 * automation-rules `set_production_stage` action) routes a legacy `stage` to
 * the correct track(s), writes every track field, and emits the matching
 * per-track event — rather than always writing `production_stage` + emitting
 * the generic event (which left artwork/blanks stages from drifting and
 * stopped the artwork-approval email from firing). Returns the metadata patch
 * to merge and the events to emit; `changed: false` when it's a no-op.
 *
 * NOTE: keep in lockstep with the route handler's inline logic.
 */
export function planProductionStageChange(
  meta: Record<string, unknown>,
  input: ProductionStageChangeInput,
  opts: {
    orderId: string
    changedAt: string
    changedBy: string
    note?: string | null
  }
): ProductionStageChangePlan {
  const current = resolveTracksFromMeta(meta)
  let nextArtwork: ArtworkStage = current.artwork
  let nextBlanks: BlanksStage = current.blanks
  let nextDownstream: DownstreamStage = current.downstream

  if (input.artwork_stage) nextArtwork = input.artwork_stage
  if (input.blanks_stage) nextBlanks = input.blanks_stage
  if (input.production_stage) nextDownstream = input.production_stage
  if (input.stage) {
    if (isArtworkStage(input.stage)) nextArtwork = input.stage
    else if (isBlanksStage(input.stage)) nextBlanks = input.stage
    else if (isDownstreamStage(input.stage)) nextDownstream = input.stage
    else {
      const d = deriveTracksFromLegacyStage(input.stage)
      nextArtwork = d.artwork_stage
      nextBlanks = d.blanks_stage
      nextDownstream = d.production_stage
    }
  }

  const transitions: Array<{
    track: ProductionTrack
    from: ProductionStage
    to: ProductionStage
  }> = []
  if (nextArtwork !== current.artwork)
    transitions.push({ track: "artwork", from: current.artwork, to: nextArtwork })
  if (nextBlanks !== current.blanks)
    transitions.push({ track: "blanks", from: current.blanks, to: nextBlanks })
  if (nextDownstream !== current.downstream)
    transitions.push({
      track: "production",
      from: current.downstream,
      to: nextDownstream,
    })

  if (transitions.length === 0) {
    return { changed: false, metadata: null, events: [] }
  }

  const note = opts.note ?? null
  const history = readHistoryFromMeta(meta)
  const newEntries: ProductionStageHistoryEntry[] = transitions.map((t) => ({
    stage: t.to,
    changed_at: opts.changedAt,
    changed_by: opts.changedBy,
    note,
    track: t.track,
  }))

  const downstreamChanged = transitions.find((t) => t.track === "production")
  const persistedStage: ProductionStage = downstreamChanged
    ? downstreamChanged.to
    : transitions[transitions.length - 1].to

  const m = meta as {
    artwork_stage_changed_at?: unknown
    blanks_stage_changed_at?: unknown
  }
  const artworkChanged = transitions.some((t) => t.track === "artwork")
  const blanksChanged = transitions.some((t) => t.track === "blanks")

  const events = transitions.map((t) => ({
    name:
      t.track === "artwork"
        ? ARTWORK_STAGE_EVENT
        : t.track === "blanks"
          ? BLANKS_STAGE_EVENT
          : PRODUCTION_STAGE_EVENT,
    data: {
      order_id: opts.orderId,
      from_stage: t.from,
      to_stage: t.to,
      changed_at: opts.changedAt,
      changed_by: opts.changedBy,
      note,
      track: t.track,
    } as ProductionStageChangedEvent,
  }))

  return {
    changed: true,
    metadata: {
      production_stage: persistedStage,
      production_stage_changed_at: opts.changedAt,
      production_stage_history: [...history, ...newEntries],
      artwork_stage: nextArtwork,
      artwork_stage_changed_at: artworkChanged
        ? opts.changedAt
        : typeof m.artwork_stage_changed_at === "string"
          ? m.artwork_stage_changed_at
          : null,
      blanks_stage: nextBlanks,
      blanks_stage_changed_at: blanksChanged
        ? opts.changedAt
        : typeof m.blanks_stage_changed_at === "string"
          ? m.blanks_stage_changed_at
          : null,
    },
    events,
  }
}

import {
  ARTWORK_STAGES,
  BLANKS_STAGES,
  DOWNSTREAM_STAGES,
  DOWNSTREAM_STAGE_SLA_DAYS,
  resolveTracksFromMeta,
  type ProductionStage,
  type ProductionTrack,
} from "../production-stage"
import { studioDate } from "../business-days"

/**
 * Shared helpers for the report routes under /admin/reports/*. Pulled into
 * a non-routed `_lib` folder (Medusa's file-based routing only matches
 * `route.{ts,tsx}` — `_lib/*.ts` is just module code).
 */

export const DECORATION_METHODS = [
  "embroidery",
  "dtf",
  "screen",
  "uvdtf_sheet",
  "uvdtf_applied",
  "uv",
] as const

/**
 * Beyond the real methods:
 *   - "blank": a catalog garment sold with nothing recorded as decoration.
 *   - "service": fee lines (setup, freight, artwork, digitising…), not garments.
 *   - "unrecorded": a quoted garment line (often customer-supplied) that carries
 *     no method. Reported as such rather than guessed.
 */
export type DecorationMethod =
  | (typeof DECORATION_METHODS)[number]
  | "blank"
  | "service"
  | "unrecorded"

export const REPORT_METHOD_KEYS: DecorationMethod[] = [
  ...DECORATION_METHODS,
  "blank",
  "service",
  "unrecorded",
]

export const isDecorationMethodOrBlank = (s: string): s is DecorationMethod =>
  (REPORT_METHOD_KEYS as readonly string[]).includes(s)

type LineItemMeta = {
  decorationDesign?: { method?: unknown }
  vectorization_for_order?: unknown
  customizerDesign?: unknown
  reorder_source?: unknown
  quote_locked_price?: unknown
  quote_custom_line?: unknown
  artwork_fee?: unknown
}

type CustomizerDesignLike = {
  pricing?: {
    server?: {
      mode?: unknown
      embroidery_side_keys?: unknown
      print_side_keys?: unknown
    }
  }
  sideDecorationMethods?: Record<string, string>
  scpPrintSizeId?: unknown
  prints?: unknown[]
  artifacts?: unknown[]
}

/**
 * Infer production/reporting decoration method from Fabric customizer metadata.
 * Storefront customizer lines use `customizerDesign` (not `decorationDesign`);
 * SCP DTF cart pricing stamps `pricing.server.mode` as `scp_dtf` / `scp_dtf_mixed`.
 */
export const inferDecorationMethodFromCustomizer = (
  design: CustomizerDesignLike
): DecorationMethod => {
  const server = design.pricing?.server
  const mode = typeof server?.mode === "string" ? server.mode : null

  const sideMethods = Object.values(design.sideDecorationMethods ?? {})
  if (sideMethods.includes("screen")) return "screen"

  const embroideryKeys = Array.isArray(server?.embroidery_side_keys)
    ? (server.embroidery_side_keys as string[]).filter(Boolean)
    : []
  const printKeys = Array.isArray(server?.print_side_keys)
    ? (server.print_side_keys as string[]).filter(Boolean)
    : []
  const hasEmbroidery = embroideryKeys.length > 0 || sideMethods.includes("embroidery")
  const hasPrint =
    printKeys.length > 0 || sideMethods.some((m) => !m || m === "print") || mode === "scp_dtf"

  // A size id and `prints[]` sit on embroidery lines too, so they can't decide this.
  if (hasEmbroidery && !hasPrint) return "embroidery"

  // Everything else the customizer has produced is DTF.
  return "dtf"
}

const SERVICE_TITLE =
  /setup|freight|delivery|shipping|redraw|artwork|digitis|colour change|dtf print/i
const SERVICE_SKUS = new Set(["SERVICE-LINE", "SCREEN-SETUP"])

/**
 * Setup, freight, artwork and similar fee lines. Customer-supplied garments are
 * sold through the same SERVICE-LINE variant but they are garments, not fees.
 */
export const isServiceLine = (item: {
  title?: unknown
  variant_sku?: unknown
  metadata?: unknown
}): boolean => {
  const title = typeof item?.title === "string" ? item.title : ""
  if (/customer[- ]supplied/i.test(title)) return false
  if ((item?.metadata as LineItemMeta | null)?.artwork_fee != null) return true
  return (
    SERVICE_TITLE.test(title) ||
    (typeof item?.variant_sku === "string" && SERVICE_SKUS.has(item.variant_sku))
  )
}

/** A garment from the catalog, as opposed to fees or customer-supplied garments. */
export const isCatalogGarmentLine = (item: {
  title?: unknown
  variant_id?: unknown
  variant_sku?: unknown
  metadata?: unknown
}): boolean =>
  typeof item?.variant_id === "string" &&
  !isServiceLine(item) &&
  !(typeof item?.variant_sku === "string" && SERVICE_SKUS.has(item.variant_sku))

/**
 * Classify a single line item by decoration method. Used by the production
 * dashboard snapshot and decoration-mix reports.
 */
export const itemMethod = (item: {
  title?: unknown
  variant_sku?: unknown
  metadata?: unknown
}): DecorationMethod => {
  const meta = (item?.metadata ?? {}) as LineItemMeta
  const m = meta?.decorationDesign?.method
  if (typeof m === "string" && (DECORATION_METHODS as readonly string[]).includes(m)) {
    return m as DecorationMethod
  }
  if (meta?.customizerDesign && typeof meta.customizerDesign === "object") {
    return inferDecorationMethodFromCustomizer(
      meta.customizerDesign as CustomizerDesignLike
    )
  }
  if (isServiceLine(item)) return "service"
  if (meta.quote_custom_line != null || meta.quote_locked_price != null) return "unrecorded"
  return "blank"
}

/**
 * True when the customer placed the order themselves through the storefront
 * checkout. Quote conversions stamp `metadata.quote_id` and are staff actions,
 * so behaviour reports (time of day, funnels, first-order affinity) skip them.
 */
export const isCheckoutOrder = (order: any): boolean =>
  (order?.metadata as Record<string, unknown> | null)?.quote_id == null

export const itemHasReorderSource = (item: { metadata?: unknown }): boolean => {
  const meta = (item?.metadata ?? {}) as LineItemMeta
  return typeof meta.reorder_source === "string" && meta.reorder_source.length > 0
}

/**
 * Parse `?from=ISO&to=ISO` query params into a date window. Defaults to
 * the last 30 days if either side is missing or malformed.
 */
export const parseDateRange = (
  query: Record<string, unknown>
): { from: Date; to: Date } => {
  const fromRaw = typeof query.from === "string" ? query.from : ""
  const toRaw = typeof query.to === "string" ? query.to : ""
  const fromMs = Date.parse(fromRaw)
  const toMs = Date.parse(toRaw)
  const now = Date.now()

  const to = Number.isFinite(toMs) ? new Date(toMs) : new Date(now)
  const from = Number.isFinite(fromMs)
    ? new Date(fromMs)
    : new Date(now - 30 * 86_400_000)
  return { from, to }
}

/**
 * Same window length immediately preceding `[from, to]` — used by every
 * report that wants a "vs prior period" comparison.
 */
export const priorRange = (
  from: Date,
  to: Date
): { from: Date; to: Date } => {
  const periodMs = to.getTime() - from.getTime()
  const priorTo = new Date(from)
  const priorFrom = new Date(from.getTime() - periodMs)
  return { from: priorFrom, to: priorTo }
}

/**
 * Pull a region_id filter out of a query string. Returns the trimmed id
 * or null. Multi-region selection isn't supported yet — keep simple.
 */
export const parseRegionFilter = (
  query: Record<string, unknown>
): string | null => {
  const raw = (query.region_id as string | undefined)?.trim()
  if (!raw) return null
  return raw
}

/**
 * True when an order matches the active region filter (or no filter is
 * active).
 */
export const matchesRegion = (order: any, regionId: string | null): boolean => {
  if (!regionId) return true
  return order?.region_id === regionId
}

/**
 * True when an order is dead — no one is ever going to produce it. Two
 * ways an order dies:
 *
 *   - cancelled outright (`status = "canceled"`)
 *   - fully refunded (`payment_status = "refunded"`), e.g. the blanks
 *     turned out to be unavailable. The order status stays "pending"
 *     forever, so it looks live to anything that only checks `status`.
 *
 * Neither path touches `metadata.production_stage`, so a dead order keeps
 * whatever stage it died at and shows up in every stage-based surface
 * (SLA breach, dwell times, calendar, print queue, stale scan) as if it
 * were work in progress. Every production surface must skip these.
 *
 * `partially_refunded` is NOT dead — part of that job is still real work.
 */
export const isNotProceeding = (order: any): boolean => {
  const status = String(order?.status ?? "").toLowerCase()
  if (status === "canceled") return true
  if (String(order?.payment_status ?? "").toLowerCase() === "refunded") return true
  // query.graph leaves payment_status empty, so read the summary when loaded.
  const paid = Number(order?.summary?.paid_total ?? 0)
  const refunded = Number(order?.summary?.refunded_total ?? 0)
  return paid > 0 && refunded >= paid
}

/**
 * Compute a percent delta safely (returns null if prior is zero —
 * frontend should render "no prior data" rather than ∞%).
 */
export const pctDelta = (current: number, prior: number): number | null => {
  if (!Number.isFinite(prior) || prior === 0) return null
  return Math.round(((current - prior) / prior) * 1000) / 10
}

export const inRange = (
  iso: string | null | undefined,
  from: Date,
  to: Date
): boolean => {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return t >= from.getTime() && t <= to.getTime()
}

/**
 * Bucket a list of dates into weeks (Monday-anchored). Returns an array
 * of `{ start, label }` for every week between `from` and `to`, plus a
 * helper to find which bucket a given date belongs to.
 */
export const buildWeekBuckets = (from: Date, to: Date) => {
  const buckets: Array<{ start: Date; label: string }> = []
  const cursor = startOfWeek(from)
  while (cursor.getTime() <= to.getTime()) {
    const start = new Date(cursor)
    buckets.push({
      start,
      label: start.toISOString().slice(0, 10),
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  const findBucket = (iso: string): number => {
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) return -1
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].start.getTime()) return i
    }
    return -1
  }
  return { buckets, findBucket }
}

const startOfWeek = (d: Date): Date => {
  const x = new Date(d)
  const dow = x.getUTCDay() // 0 = Sunday
  // Monday = 1; back up however many days we are past Monday.
  const diff = (dow + 6) % 7
  x.setUTCDate(x.getUTCDate() - diff)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

/**
 * Resolve a stage value to its position WITHIN ITS OWN TRACK (normalising
 * legacy aliases). `PRODUCTION_STAGES` is a union of all three parallel tracks,
 * NOT a chronological order, so comparing union indices (or pairing consecutive
 * history entries across tracks) gives nonsense.
 */
export function trackPosition(
  stage: string
): { track: ProductionTrack; index: number } | null {
  let s = stage
  if (s === "art_review") s = "in_review"
  else if (s === "blanks_ordered") s = "ordered"
  else if (s === "blanks_arrived") s = "arrived"

  let idx = (ARTWORK_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "artwork", index: idx }
  idx = (BLANKS_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "blanks", index: idx }
  idx = (DOWNSTREAM_STAGES as readonly string[]).indexOf(s)
  if (idx >= 0) return { track: "production", index: idx }
  return null
}

/** `production_stage_history`, cleaned and oldest first. */
export const stageHistory = (
  order: any
): Array<{ stage: ProductionStage; changed_at: string; track: ProductionTrack }> => {
  const raw = (order?.metadata as Record<string, unknown> | null)?.production_stage_history
  if (!Array.isArray(raw)) return []
  const entries: Array<{ stage: ProductionStage; changed_at: string; track: ProductionTrack }> = []
  for (const e of raw) {
    if (typeof e?.stage !== "string" || typeof e?.changed_at !== "string") continue
    if (!Number.isFinite(Date.parse(e.changed_at))) continue
    const pos = trackPosition(e.stage)
    if (!pos) continue
    entries.push({ stage: e.stage as ProductionStage, changed_at: e.changed_at, track: pos.track })
  }
  return entries.sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at))
}

export type StageTransition = {
  track: ProductionTrack
  from_stage: ProductionStage
  to_stage: ProductionStage
  entered_at: string
  exited_at: string
  days: number
  rollback: boolean
}

/** Every move an order made, each paired with the previous entry on the SAME track. */
export const stageTransitions = (order: any): StageTransition[] => {
  const last = new Map<ProductionTrack, { stage: ProductionStage; changed_at: string }>()
  const out: StageTransition[] = []
  for (const e of stageHistory(order)) {
    const prev = last.get(e.track)
    if (prev) {
      out.push({
        track: e.track,
        from_stage: prev.stage,
        to_stage: e.stage,
        entered_at: prev.changed_at,
        exited_at: e.changed_at,
        days: Math.max(0, (Date.parse(e.changed_at) - Date.parse(prev.changed_at)) / 86_400_000),
        rollback: trackPosition(e.stage)!.index < trackPosition(prev.stage)!.index,
      })
    }
    last.set(e.track, e)
  }
  return out
}

/** The stage each track is on now and when it got there. */
export const currentTrackStages = (
  order: any
): Array<{ track: ProductionTrack; stage: ProductionStage; changed_at: string }> => {
  const last = new Map<
    ProductionTrack,
    { track: ProductionTrack; stage: ProductionStage; changed_at: string }
  >()
  for (const e of stageHistory(order)) last.set(e.track, e)
  return [...last.values()]
}

// The end of a track: time spent here isn't waiting on anyone.
export const TERMINAL_STAGES = new Set<string>(["approved", "arrived", "blanks_arrived", "delivered"])

/**
 * Dwell time (in days) for each stage the order has since left, measured
 * against the next move on the same track. The stage a track is on now is
 * excluded because its dwell isn't final yet; so are track end stages.
 */
export const computeStageDwellDays = (
  order: any
): Array<{ stage: ProductionStage; days: number; exited_at: string }> =>
  stageTransitions(order)
    .filter((t) => !TERMINAL_STAGES.has(t.from_stage))
    .map((t) => ({ stage: t.from_stage, days: t.days, exited_at: t.exited_at }))

/** First time the order reached shipped, or delivered when shipped was skipped. */
export const shippedAt = (order: any): string | null => {
  const history = stageHistory(order)
  return (
    history.find((e) => e.stage === "shipped")?.changed_at ??
    history.find((e) => e.stage === "delivered")?.changed_at ??
    null
  )
}

/** Still to leave the building: not dead, and production hasn't reached shipped. */
export const isOpenUnshipped = (order: any): boolean => {
  if (isNotProceeding(order)) return false
  const meta = (order?.metadata ?? {}) as Record<string, unknown>
  if (typeof meta.production_stage !== "string") return false
  const { downstream } = resolveTracksFromMeta(meta)
  return downstream !== "shipped" && downstream !== "delivered"
}

/** SLA days of production work left, up to the point the job ships. */
export const workDaysToShip = (order: any, nowMs: number): number => {
  const meta = (order?.metadata ?? {}) as Record<string, unknown>
  const { downstream } = resolveTracksFromMeta(meta)
  const lastEntered = stageHistory(order)
    .filter((e) => e.stage === downstream)
    .pop()?.changed_at
  const daysIn = lastEntered ? Math.max(0, (nowMs - Date.parse(lastEntered)) / 86_400_000) : 0
  let work = Math.max(0, (DOWNSTREAM_STAGE_SLA_DAYS[downstream] ?? 0) - daysIn)
  const start = (DOWNSTREAM_STAGES as readonly string[]).indexOf(downstream)
  for (let i = start + 1; i < DOWNSTREAM_STAGES.length; i++) {
    const stage = DOWNSTREAM_STAGES[i]
    if (stage === "shipped") break
    work += DOWNSTREAM_STAGE_SLA_DAYS[stage] ?? 0
  }
  return work
}

/** The date (YYYY-MM-DD, studio time) a job should ship: its due date, else an SLA estimate. */
export const projectedShipDate = (order: any, nowMs: number): string => {
  const due = (order?.metadata as Record<string, unknown> | null)?.production_due_date
  if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}/.test(due)) return due.slice(0, 10)
  return studioDate(new Date(nowMs + workDaysToShip(order, nowMs) * 86_400_000))
}

/**
 * Median + p90 of an array of numbers. Returns 0,0 for an empty input
 * rather than NaN so the frontend doesn't have to special-case empty
 * stages.
 */
export const summarise = (values: number[]): { median: number; p90: number } => {
  if (values.length === 0) return { median: 0, p90: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const median = percentile(sorted, 0.5)
  const p90 = percentile(sorted, 0.9)
  return {
    median: Math.round(median * 10) / 10,
    p90: Math.round(p90 * 10) / 10,
  }
}

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0
  const idx = (sortedAsc.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

/**
 * Defensive batch-fetch of orders with the fields every report needs.
 * Sets a hard cap (default 5000) to avoid runaway responses if the
 * order count grows unexpectedly. Reports should consider this their
 * working set — for higher volumes we'd materialise a view.
 */
/**
 * Fetch orders for a report, but on failure send the standard
 * `500 { error: "Failed to load orders" }` and return null — so a route
 * collapses the repeated try/catch to:
 *   `const orders = await loadOrdersOr500(query, res, logger, "tag"); if (!orders) return`
 * An empty array is a valid (truthy) success. Pass `fields` for routes that
 * need a non-default graph selection (e.g. `refunds.*`).
 */
export const loadOrdersOr500 = async (
  query: any,
  res: any,
  logger: any,
  tag: string,
  fields?: readonly string[]
): Promise<any[] | null> => {
  try {
    if (fields) {
      const { data } = await query.graph({
        entity: "order",
        fields: fields as string[],
        pagination: { take: 5000, skip: 0 },
      })
      return (data as any[]) ?? []
    }
    return await fetchOrdersForReports(query)
  } catch (err: any) {
    logger?.error?.(`[${tag}] order fetch failed: ${err?.message ?? err}`)
    res.status(500).json({
      error: "Failed to load orders",
      detail: String(err?.message ?? err),
    })
    return null
  }
}

export const fetchOrdersForReports = async (
  query: any,
  options: { take?: number } = {}
): Promise<any[]> => {
  const take = options.take ?? 5000
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "status",
      "payment_status",
      "metadata",
      "currency_code",
      "total",
      "subtotal",
      "email",
      "customer_id",
      "region_id",
      "items.id",
      "items.title",
      "items.product_title",
      "items.quantity",
      "items.unit_price",
      "items.product_id",
      "items.variant_id",
      "items.variant_sku",
      "items.metadata",
      // Without `items.detail.*` the graph leaves `items.quantity` undefined
      // and `total` = shipping only (probed prod 2026-09-03: Aug revenue
      // read as $26 instead of $3,216). `summary.current_order_total` is the
      // figure the order-placed email + invoices use, correct in both the
      // GST-exclusive (pre 2026-08) and GST-inclusive eras; the decorated
      // `total` re-adds 10% on inc-GST lines, so we override it.
      "items.detail.quantity",
      "summary.*",
    ],
    pagination: { take, skip: 0 },
  })
  const orders = (data as any[]) ?? []
  for (const o of orders) {
    const cur = o?.summary?.current_order_total
    if (cur != null && Number.isFinite(Number(cur))) o.total = Number(cur)
  }
  return orders
}

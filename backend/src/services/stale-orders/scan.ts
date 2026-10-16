import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import {
  SLACK_PRODUCTION_WEBHOOK_URL,
  STALE_ORDER_ESCALATION_DAYS,
  STALE_ORDER_THRESHOLD_DAYS,
} from "../../lib/constants"
import {
  escalateStaleOrders,
  notifyStaleOrders,
  type NotifyResult,
} from "./notify"
import { isNotProceeding } from "../../lib/reports/orders"
import { businessDaysBetween } from "../../lib/business-days"
import {
  isDownstreamStage,
  resolveTracksFromMeta,
  type ProductionTrack,
} from "../../lib/production-stage"

const TERMINAL_STAGES = new Set(["shipped", "delivered"])

export type StaleOrderEntry = {
  order_id: string
  display_id: number | null
  stage: string
  /** Business days at the stuck stage. */
  days_in_stage: number
  email: string | null
  customer_id: string | null
}

export type ScanResult = {
  considered: number
  newly_stale: StaleOrderEntry[]
  cleared: number
  notify?: NotifyResult
}

/**
 * How many business days a track may sit at each stage before the order is
 * flagged as stuck. A stage not listed here is never "stuck" on its own:
 * artwork `pending` and blanks `not_started` are normal while other work runs.
 * `received` uses STALE_ORDER_THRESHOLD_DAYS and counts from the last activity
 * on ANY track, so it catches an order nobody has touched at all.
 *
 * `awaiting_approval` at 4 is the owner alert for unanswered proofs; the
 * customer gets their own reminder at 2 (send-proof-reminders).
 */
export const STUCK_AFTER_BUSINESS_DAYS: Record<ProductionTrack, Record<string, number>> = {
  artwork: { in_review: 2, awaiting_approval: 4 },
  blanks: { ordered: 5 },
  production: { in_production: 3, quality_check: 2 },
}

export type StuckTrack = {
  track: ProductionTrack
  stage: string
  /** When the track entered this stage. */
  since: string
  days: number
  limit: number
  /** Identifies this stay at this stage: notify/escalate once per key. */
  key: string
}

const validIso = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null

const latestIso = (values: (string | null)[]): string | null =>
  values.filter((v): v is string => v !== null).sort().at(-1) ?? null

/** When the production track entered its current stage, from history first. */
function downstreamChangedAt(meta: Record<string, unknown>): string | null {
  const history = Array.isArray(meta.production_stage_history)
    ? (meta.production_stage_history as { stage?: unknown; changed_at?: unknown; track?: unknown }[])
    : []
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i]
    if ((e.track === "production" || !e.track) && isDownstreamStage(e.stage)) {
      const at = validIso(e.changed_at)
      if (at) return at
    }
  }
  return validIso(meta.production_stage_changed_at)
}

/**
 * Pure: the first track (artwork, then blanks, then production) that has sat
 * at its stage longer than its limit, or null.
 */
export function findStuckTrack(
  meta: Record<string, unknown>,
  now: Date,
  receivedLimit: number = STALE_ORDER_THRESHOLD_DAYS
): StuckTrack | null {
  const tracks = resolveTracksFromMeta(meta)
  const artworkAt = validIso(meta.artwork_stage_changed_at)
  const blanksAt = validIso(meta.blanks_stage_changed_at)
  const downstreamAt = downstreamChangedAt(meta)

  const candidates: { track: ProductionTrack; stage: string; since: string | null; limit?: number }[] = [
    { track: "artwork", stage: tracks.artwork, since: artworkAt },
    { track: "blanks", stage: tracks.blanks, since: blanksAt },
    // `received` is the "nobody has touched it" net. When artwork or blanks
    // are at a stage with their own limit, those limits judge the order
    // (otherwise an unanswered proof would trip `received` at day 3, before
    // its own 4-day limit).
    tracks.downstream === "received"
      ? STUCK_AFTER_BUSINESS_DAYS.artwork[tracks.artwork] ||
        STUCK_AFTER_BUSINESS_DAYS.blanks[tracks.blanks]
        ? { track: "production", stage: "received", since: null }
        : {
          track: "production",
          stage: "received",
          since: latestIso([artworkAt, blanksAt, downstreamAt, validIso(meta.production_stage_changed_at)]),
          limit: receivedLimit,
        }
      : { track: "production", stage: tracks.downstream, since: downstreamAt },
  ]

  for (const c of candidates) {
    const limit = c.limit ?? STUCK_AFTER_BUSINESS_DAYS[c.track][c.stage]
    if (!limit || !c.since) continue
    const days = businessDaysBetween(new Date(c.since), now)
    if (days >= limit) {
      return {
        track: c.track,
        stage: c.stage,
        since: c.since,
        days,
        limit,
        key: `${c.track}:${c.stage}:${c.since}`,
      }
    }
  }
  return null
}

const STALE_FLAG_KEYS = ["is_stale", "stale_since", "stale_track", "stale_stage", "stale_stage_since"]

export type StalePlan = {
  stuck: StuckTrack | null
  /** Metadata to write, or null when nothing changes. */
  metadata: Record<string, unknown> | null
  /** First time this stay at this stage is flagged: notify the owner. */
  notify: boolean
}

/**
 * Pure per-order decision. Shipped/delivered, cancelled and fully refunded
 * orders are never stuck, and any flag they carry is released (a leftover
 * flag otherwise shows "Stale" forever). Notification is keyed on the stuck
 * stay, not on `is_stale`, because staff stage edits clear `is_stale` and
 * would otherwise re-trigger the owner email the next morning.
 */
export function planStaleUpdate(
  meta: Record<string, unknown>,
  now: Date,
  options: { notProceeding?: boolean; receivedLimit?: number } = {}
): StalePlan {
  const flagged = meta.is_stale === true
  const tracks = resolveTracksFromMeta(meta)
  const stuck =
    options.notProceeding || TERMINAL_STAGES.has(tracks.downstream)
      ? null
      : findStuckTrack(meta, now, options.receivedLimit)

  if (!stuck) {
    if (!flagged && !STALE_FLAG_KEYS.some((k) => k in meta)) {
      return { stuck: null, metadata: null, notify: false }
    }
    const clean = { ...meta }
    for (const k of STALE_FLAG_KEYS) delete clean[k]
    return { stuck: null, metadata: clean, notify: false }
  }

  const notify = meta.stale_notified_key !== stuck.key
  const next: Record<string, unknown> = {
    ...meta,
    is_stale: true,
    stale_since: flagged && !notify && validIso(meta.stale_since) ? meta.stale_since : now.toISOString(),
    stale_track: stuck.track,
    stale_stage: stuck.stage,
    stale_stage_since: stuck.since,
    stale_notified_key: stuck.key,
  }
  // A new stuck stay starts a new escalation streak.
  if (notify) delete next.stale_escalated_at
  const changed =
    !flagged || notify || ["stale_track", "stale_stage", "stale_stage_since"].some((k) => meta[k] !== next[k])
  return { stuck, metadata: changed ? next : null, notify }
}

/**
 * Walks every in-flight order and stamps `metadata.is_stale` (plus which
 * track/stage is stuck) when any track has sat past its limit in
 * STUCK_AFTER_BUSINESS_DAYS. Orders stuck at a new stage are returned so the
 * cron can post them to Slack and notify owners.
 *
 * Idempotent — running twice in a row produces the same metadata.
 * Stuck → moving transitions clear the flag.
 */
export async function scanStaleOrders(
  container: MedusaContainer,
  options: { now?: Date; thresholdDays?: number } = {}
): Promise<ScanResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = options.now ?? new Date()
  const thresholdDays = options.thresholdDays ?? STALE_ORDER_THRESHOLD_DAYS

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService = container.resolve(Modules.ORDER) as any

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "customer_id",
      "status",
      "payment_status",
      "metadata",
    ],
    pagination: { take: 5000, skip: 0 },
  })

  const newlyStale: StaleOrderEntry[] = []
  const escalationCandidates: StaleOrderEntry[] = []
  let considered = 0
  let cleared = 0

  for (const o of (orders as any[]) ?? []) {
    const meta = (o?.metadata as Record<string, unknown> | undefined) ?? {}
    const plan = planStaleUpdate(meta, now, {
      notProceeding: isNotProceeding(o),
      receivedLimit: thresholdDays,
    })
    considered += 1

    if (plan.metadata) {
      try {
        await orderModuleService.updateOrders(o.id, { metadata: plan.metadata })
        if (!plan.stuck) cleared += 1
      } catch (err: any) {
        logger.warn(`stale-orders: failed to update ${o.id}: ${err?.message ?? err}`)
        continue
      }
    }
    if (!plan.stuck) continue

    const entry: StaleOrderEntry = {
      order_id: o.id as string,
      display_id: typeof o.display_id === "number" ? o.display_id : null,
      stage: plan.stuck.stage,
      days_in_stage: plan.stuck.days,
      email: typeof o.email === "string" ? o.email : null,
      customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
    }
    if (plan.notify) newlyStale.push(entry)
    // Escalate orders that have STAYED stuck past limit + ESCALATION days.
    // notifyStaleOrders' newly-stale list is always ~limit days old, so it
    // can never reach this window on its own.
    if (
      plan.stuck.days >= plan.stuck.limit + STALE_ORDER_ESCALATION_DAYS &&
      (plan.metadata ?? meta).stale_escalated_at == null
    ) {
      escalationCandidates.push(entry)
    }
  }

  if (newlyStale.length > 0 && SLACK_PRODUCTION_WEBHOOK_URL) {
    await postSlackDigest(newlyStale).catch((err) =>
      logger.warn(`stale-orders: Slack post failed: ${err?.message ?? err}`)
    )
  }

  // Phase 11 — owner notification + task creation (newly-stale only).
  let notify: NotifyResult | undefined
  if (newlyStale.length > 0) {
    try {
      notify = await notifyStaleOrders(container, newlyStale, { now })
    } catch (err: any) {
      logger.warn(
        `stale-orders: notify side-effects failed: ${err?.message ?? err}`
      )
    }
  }

  // Phase 11 — manager escalation for orders stale past THRESHOLD + ESCALATION.
  if (escalationCandidates.length > 0) {
    try {
      const esc = await escalateStaleOrders(container, escalationCandidates, {
        now,
      })
      notify = {
        tasks_created: notify?.tasks_created ?? 0,
        owners_notified: notify?.owners_notified ?? 0,
        managers_escalated: esc.managers_escalated,
      }
    } catch (err: any) {
      logger.warn(
        `stale-orders: manager escalation failed: ${err?.message ?? err}`
      )
    }
  }

  return { considered, newly_stale: newlyStale, cleared, notify }
}

async function postSlackDigest(entries: StaleOrderEntry[]): Promise<void> {
  const url = SLACK_PRODUCTION_WEBHOOK_URL
  if (!url) return
  const lines = entries
    .map(
      (e) =>
        `• #${e.display_id ?? e.order_id.slice(-8)} — ${e.stage} for ${e.days_in_stage} business days` +
        (e.email ? ` (${e.email})` : "")
    )
    .join("\n")
  const text = `*${entries.length} order${entries.length === 1 ? "" : "s"} stale* (past their stage limit)\n${lines}`
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    throw err
  }
}

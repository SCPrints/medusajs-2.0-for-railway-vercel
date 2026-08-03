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

const TERMINAL_STAGES = new Set(["shipped", "delivered"])

export type StaleOrderEntry = {
  order_id: string
  display_id: number | null
  stage: string
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

export type StaleAction = "flag" | "clear" | "none"

/**
 * Pure per-order decision, extracted so the terminal-stage case can be
 * unit-tested without a container.
 *
 * Terminal stages are never *flagged* stale — but an order that was
 * flagged at an earlier stage and has since reached shipped/delivered
 * MUST be cleared. Nothing else in the codebase clears `is_stale`, so
 * the pre-2026-08 behaviour (skipping terminal stages outright, before
 * the clear branch) left the red "Stale" badge stuck permanently on
 * delivered orders — and the badge renders the *current* stage against
 * the *old* stale_since date, producing nonsense like "hasn't moved in
 * from delivered 35 day(s)".
 */
export function decideStaleAction(input: {
  stage: string | null
  flagged: boolean
  ageMs: number | null
  thresholdMs: number
}): StaleAction {
  const { stage, flagged, ageMs, thresholdMs } = input
  if (!stage) return "none"
  if (TERMINAL_STAGES.has(stage)) return flagged ? "clear" : "none"
  if (ageMs === null || !Number.isFinite(ageMs)) return "none"
  if (ageMs >= thresholdMs) return flagged ? "none" : "flag"
  return flagged ? "clear" : "none"
}

/**
 * Walks every in-flight order (not delivered, not shipped, not
 * cancelled) and stamps `metadata.is_stale` based on whether the
 * current production_stage has advanced within
 * STALE_ORDER_THRESHOLD_DAYS. Newly-stale orders are returned so the
 * cron can post them to Slack.
 *
 * Idempotent — running twice in a row produces the same metadata.
 * Stale → fresh transitions clear the flag.
 */
export async function scanStaleOrders(
  container: MedusaContainer,
  options: { now?: Date; thresholdDays?: number } = {}
): Promise<ScanResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const now = options.now ?? new Date()
  const thresholdDays = options.thresholdDays ?? STALE_ORDER_THRESHOLD_DAYS
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000
  const escalationMs =
    (thresholdDays + STALE_ORDER_ESCALATION_DAYS) * 24 * 60 * 60 * 1000

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService = container.resolve(Modules.ORDER) as any

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "customer_id", "status", "metadata"],
    pagination: { take: 5000, skip: 0 },
  })

  const newlyStale: StaleOrderEntry[] = []
  const escalationCandidates: StaleOrderEntry[] = []
  let considered = 0
  let cleared = 0

  for (const o of (orders as any[]) ?? []) {
    if ((o?.status ?? "").toLowerCase() === "canceled") continue
    const meta = (o?.metadata as Record<string, unknown> | undefined) ?? {}
    const stage = typeof meta.production_stage === "string" ? meta.production_stage : null
    const wasMarkedStale = meta.is_stale === true

    const clearStale = async () => {
      try {
        const cleanMeta = { ...meta }
        delete (cleanMeta as any).is_stale
        delete (cleanMeta as any).stale_since
        await orderModuleService.updateOrders(o.id, { metadata: cleanMeta })
        cleared += 1
      } catch {
        // best-effort
      }
    }

    // Terminal stages: never flagged, but a flag carried in from an
    // earlier stage has to be released here or it sticks forever.
    if (stage && TERMINAL_STAGES.has(stage)) {
      if (wasMarkedStale) await clearStale()
      continue
    }
    if (!stage) continue
    considered += 1

    const changedAtRaw =
      typeof meta.production_stage_changed_at === "string"
        ? meta.production_stage_changed_at
        : null
    const changedMs = changedAtRaw ? Date.parse(changedAtRaw) : NaN
    if (!Number.isFinite(changedMs)) {
      continue
    }
    const ageMs = now.getTime() - changedMs
    const isStaleNow = ageMs >= thresholdMs

    // Manager-escalation candidates: any still-stale order aged past
    // THRESHOLD + ESCALATION that hasn't been escalated this streak.
    // Independent of the newly-stale / cleared branches below — escalation
    // is meant to fire *after* an order has stayed stale, which the
    // one-shot newlyStale list (always ~THRESHOLD days old) can never reach.
    if (isStaleNow && ageMs >= escalationMs && meta.stale_escalated_at == null) {
      escalationCandidates.push({
        order_id: o.id as string,
        display_id: typeof o.display_id === "number" ? o.display_id : null,
        stage,
        days_in_stage: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        email: typeof o.email === "string" ? o.email : null,
        customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
      })
    }

    if (isStaleNow && !wasMarkedStale) {
      try {
        await orderModuleService.updateOrders(o.id, {
          metadata: {
            ...meta,
            is_stale: true,
            stale_since: now.toISOString(),
          },
        })
        newlyStale.push({
          order_id: o.id as string,
          display_id: typeof o.display_id === "number" ? o.display_id : null,
          stage,
          days_in_stage: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
          email: typeof o.email === "string" ? o.email : null,
          customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
        })
      } catch (err: any) {
        logger.warn(
          `stale-orders: failed to stamp ${o.id}: ${err?.message ?? err}`
        )
      }
    } else if (!isStaleNow && wasMarkedStale) {
      await clearStale()
    }
  }

  if (newlyStale.length > 0 && SLACK_PRODUCTION_WEBHOOK_URL) {
    await postSlackDigest(newlyStale, thresholdDays).catch((err) =>
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

async function postSlackDigest(
  entries: StaleOrderEntry[],
  thresholdDays: number
): Promise<void> {
  const url = SLACK_PRODUCTION_WEBHOOK_URL
  if (!url) return
  const lines = entries
    .map(
      (e) =>
        `• #${e.display_id ?? e.order_id.slice(-8)} — ${e.stage} for ${e.days_in_stage}d` +
        (e.email ? ` (${e.email})` : "")
    )
    .join("\n")
  const text = `*${entries.length} order${entries.length === 1 ? "" : "s"} stale* (no stage change in ${thresholdDays}+ days)\n${lines}`
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

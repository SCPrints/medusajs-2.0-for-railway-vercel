import type { MedusaContainer } from "@medusajs/framework/types"

import {
  ARTWORK_STAGE_EVENT,
  isProductionStage,
  type ProductionStage,
  type ProductionStageChangedEvent,
} from "../../lib/production-stage"
import { getPostHog } from "../../lib/posthog"
import { mergeOrderMetadata } from "../../lib/order-metadata"
import { cleanProofPins } from "../../lib/proof-pins"
import { emitStageEvents } from "../../lib/stage-events"
import {
  STAGE_TRANSITION_NOT_ALLOWED,
  assertTransition,
  isTransitionNotAllowed,
} from "../../lib/production-stage-guard"
import { raiseAttention } from "../attention/notify"
import { artworkProofRound } from "./sign"

const NOT_WAITING_MESSAGE =
  "This proof isn't waiting on your approval any more. If you need to change your answer, reply to the proof email and we'll sort it."

export type ProofDecision = {
  approved: boolean
  approver_name?: string
  comment?: string
  pins?: unknown
}

export type ProofDecisionResult =
  | { ok: true; status: "approved" | "in_review" }
  | { ok: false; httpStatus: 409; error: string; message: string }

/**
 * Records the customer's answer to a proof. One function for the signed email
 * link and the account page, so both do exactly the same thing. The caller has
 * already proved the customer may answer (valid signature / owns the order).
 * `source` is only the label written to the history row.
 */
export async function decideProof(
  scope: MedusaContainer,
  order: any,
  decision: ProofDecision,
  source: "customer_link" | "customer_account" = "customer_link"
): Promise<ProofDecisionResult> {
  const orderId = order.id as string
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const round = artworkProofRound(meta)
  const previousStage =
    typeof meta.artwork_stage === "string" ? (meta.artwork_stage as string) : null
  // Only a proof that is actually out for approval can be answered. The
  // round-bound signature already rules out stale links; this is the clear
  // message for a link clicked twice or after staff moved the artwork on.
  if (previousStage !== "awaiting_approval") {
    return { ok: false, httpStatus: 409, error: "not_awaiting_approval", message: NOT_WAITING_MESSAGE }
  }
  const now = new Date().toISOString()
  const { approved, approver_name, comment } = decision
  const pins = approved ? [] : cleanProofPins(decision.pins)

  const nextStage: "approved" | "in_review" = approved ? "approved" : "in_review"

  // State machine: a customer may only answer a proof that is awaiting
  // approval (review 3-2).
  try {
    assertTransition("artwork", previousStage, nextStage, {
      actor: { kind: "customer_link", name: approver_name ?? null },
    })
  } catch (err) {
    if (!isTransitionNotAllowed(err)) throw err
    return { ok: false, httpStatus: 409, error: STAGE_TRANSITION_NOT_ALLOWED, message: NOT_WAITING_MESSAGE }
  }

  // changed_by is a fixed token, never the typed name — a customer typing a
  // staff member's name must stay distinguishable from staff (review 3-9).
  const historyEntry = {
    stage: nextStage,
    changed_at: now,
    changed_by: "customer",
    source,
    approver_name: approver_name ?? null,
    note: approved
      ? (comment ?? "Approved via customer approval page")
      : (comment ?? "Changes requested via customer approval page"),
    track: "artwork" as const,
  }

  // Patch only — merged atomically with the history entry appended, so a
  // staff save landing at the same moment loses nothing (review 3-5).
  const updates: Record<string, unknown> = {
    artwork_stage: nextStage,
    artwork_stage_changed_at: now,
  }
  if (approved) {
    updates.artwork_approved_at = now
    updates.artwork_approved_round = round
    if (approver_name) updates.artwork_approver_name = approver_name
    if (comment) updates.artwork_approver_comment = comment
  } else {
    updates.artwork_changes_requested_at = now
    if (comment) updates.artwork_changes_requested_comment = comment
    // Pins sit next to the comment; `round` is the proof round they were made on.
    updates.artwork_change_pins = { round, pins, at: now }
  }

  await mergeOrderMetadata(scope, orderId, updates, {
    append: { production_stage_history: [historyEntry] },
  })

  const fromStage: ProductionStage | null = isProductionStage(previousStage)
    ? (previousStage as ProductionStage)
    : null
  const payload: ProductionStageChangedEvent = {
    order_id: orderId,
    from_stage: fromStage,
    to_stage: nextStage as ProductionStage,
    changed_at: now,
    changed_by: "customer",
    source: "customer_link",
    track: "artwork",
  }
  await emitStageEvents(scope, orderId, [{ name: ARTWORK_STAGE_EVENT, data: payload }])

  // A change request is the customer waiting on us: task for the owner +
  // staff email now, not when the stale scan notices in two days.
  if (!approved) {
    const spots = pins.length > 0 ? `${pins.length} marked spot${pins.length === 1 ? "" : "s"}` : null
    const excerpt = [comment, spots].filter(Boolean).join(" · ") || null
    await raiseAttention(scope, {
      kind: "changes_requested",
      order_id: orderId,
      customer_id: order?.customer_id ?? null,
      label: `#${order?.display_id ?? orderId.slice(-6)}`,
      from: order?.email ?? null,
      subject: approver_name ? `Changes requested by ${approver_name}` : null,
      excerpt,
    }).catch(() => undefined)
  }

  getPostHog()?.capture({
    distinctId: order?.email ?? orderId,
    event: approved ? "artwork approved" : "artwork changes requested",
    properties: {
      order_id: orderId,
      approver_name: approver_name ?? null,
      has_comment: !!comment,
      pin_count: pins.length,
      source,
    },
  })

  return { ok: true, status: nextStage }
}

import { MedusaError } from "@medusajs/framework/utils"

import type { ProductionTrack } from "./production-stage"

/**
 * Order state-machine guard (code review 2026-10, finding 3-2).
 *
 * Backend-only on purpose: production-stage.ts is mirrored to the storefront
 * and checked by scripts/check-production-stage-sync.mjs, and this file needs
 * MedusaError. The planner imports it, so the admin route, the bulk route,
 * automation rules, POS fast-forward and the customer approval link all run
 * through one table.
 */
export type StageActor =
  | { kind: "admin"; user_id: string | null }
  | { kind: "bulk"; user_id: string | null }
  | { kind: "pos_fast_forward"; user_id: string | null }
  | { kind: "automation"; rule_id: string }
  | { kind: "customer_link"; name?: string | null }
  | { kind: "system" }

export const actorLabel = (actor: StageActor): string =>
  actor.kind === "automation" ? `automation:${actor.rule_id}` : actor.kind

/**
 * Normal forward step plus the one legitimate rewind per track. Anything else
 * needs a human and a reason (lands in history + audit). Rules and customer
 * links never get the override path.
 */
export const ALLOWED_TRANSITIONS: Record<ProductionTrack, Record<string, readonly string[]>> = {
  artwork: {
    pending: ["in_review"],
    in_review: ["awaiting_approval"],
    awaiting_approval: ["approved", "in_review"],
    approved: ["in_review"],
  },
  blanks: {
    not_started: ["ordered"],
    ordered: ["arrived", "not_started"],
    arrived: ["ordered"],
  },
  production: {
    received: ["in_production", "shipped"], // stock orders ship straight away
    in_production: ["quality_check", "received"],
    quality_check: ["shipped", "in_production"],
    shipped: ["delivered"],
    delivered: [],
  },
}

export const STAGE_TRANSITION_NOT_ALLOWED = "stage_transition_not_allowed"

const canOverride = (actor: StageActor) =>
  actor.kind === "admin" || actor.kind === "pos_fast_forward"

/**
 * Throws MedusaError CONFLICT (Medusa's error handler maps CONFLICT to 409;
 * NOT_ALLOWED would be a 400) with code `stage_transition_not_allowed`.
 */
export function assertTransition(
  track: ProductionTrack,
  from: string | null | undefined,
  to: string,
  opts: { actor: StageActor; override_reason?: string | null }
): void {
  if (from === to) return
  if (from == null || ALLOWED_TRANSITIONS[track][from]?.includes(to)) return
  if (canOverride(opts.actor) && !!opts.override_reason?.trim()) return
  throw new MedusaError(
    MedusaError.Types.CONFLICT,
    `${track}: ${from} → ${to} is not an allowed transition for ${actorLabel(opts.actor)}` +
      (canOverride(opts.actor) ? " without an override_reason" : ""),
    STAGE_TRANSITION_NOT_ALLOWED
  )
}

export const isTransitionNotAllowed = (err: unknown): err is MedusaError =>
  err instanceof MedusaError && err.code === STAGE_TRANSITION_NOT_ALLOWED

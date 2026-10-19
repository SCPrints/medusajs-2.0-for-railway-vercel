import type { ProductionTrack } from "./production-stage"

/**
 * Order state-machine guard (code review 2026-10, finding 3-2).
 *
 * The planner imports it, so the admin route, the bulk route, automation
 * rules, POS fast-forward and the customer approval link all run through one
 * table.
 *
 * NO `@medusajs/framework` imports here: production-stage.ts is imported by
 * the admin SPA (reports palette + order widgets), so anything this file pulls
 * in lands in the Vite browser bundle. Importing MedusaError dragged the whole
 * framework utils tree in and the admin died on `util.inherits is not a
 * function` before React mounted (2026-10-20). Medusa's error handler maps by
 * `err.type`, so a plain Error with `type = "conflict"` still gets a 409.
 */

export const STAGE_TRANSITION_NOT_ALLOWED = "stage_transition_not_allowed"

/** Duck-types MedusaError(CONFLICT) without importing the framework. */
export class StageTransitionError extends Error {
  readonly type = "conflict"
  readonly code = STAGE_TRANSITION_NOT_ALLOWED
  constructor(message: string) {
    super(message)
    this.name = "StageTransitionError"
  }
}
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

const canOverride = (actor: StageActor) =>
  actor.kind === "admin" || actor.kind === "pos_fast_forward"

/**
 * Throws StageTransitionError — `type: "conflict"`, which Medusa's error
 * handler maps to 409 (NOT_ALLOWED would be a 400) — with code
 * `stage_transition_not_allowed`.
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
  throw new StageTransitionError(
    `${track}: ${from} → ${to} is not an allowed transition for ${actorLabel(opts.actor)}` +
      (canOverride(opts.actor) ? " without an override_reason" : "")
  )
}

export const isTransitionNotAllowed = (err: unknown): err is StageTransitionError =>
  err instanceof StageTransitionError

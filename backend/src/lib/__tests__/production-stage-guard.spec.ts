import { MedusaError } from "@medusajs/framework/utils"

import {
  ALLOWED_TRANSITIONS,
  STAGE_TRANSITION_NOT_ALLOWED,
  assertTransition,
  isTransitionNotAllowed,
  type StageActor,
} from "../production-stage-guard"
import { ARTWORK_STAGES, BLANKS_STAGES, DOWNSTREAM_STAGES } from "../production-stage"

const admin: StageActor = { kind: "admin", user_id: "user_1" }
const pos: StageActor = { kind: "pos_fast_forward", user_id: "user_1" }
const rule: StageActor = { kind: "automation", rule_id: "rule_9" }
const customer: StageActor = { kind: "customer_link", name: "Jo" }
const system: StageActor = { kind: "system" }

const ok = (track: "artwork" | "blanks" | "production", from: string | null, to: string, actor: StageActor, reason?: string) =>
  expect(() => assertTransition(track, from, to, { actor, override_reason: reason })).not.toThrow()

const blocked = (track: "artwork" | "blanks" | "production", from: string | null, to: string, actor: StageActor, reason?: string) => {
  let caught: unknown
  try {
    assertTransition(track, from, to, { actor, override_reason: reason })
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(MedusaError)
  expect((caught as MedusaError).type).toBe(MedusaError.Types.CONFLICT)
  expect((caught as MedusaError).code).toBe(STAGE_TRANSITION_NOT_ALLOWED)
  expect(isTransitionNotAllowed(caught)).toBe(true)
}

describe("assertTransition", () => {
  it("every stage of every track has a row in the table", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS.artwork).sort()).toEqual([...ARTWORK_STAGES].sort())
    expect(Object.keys(ALLOWED_TRANSITIONS.blanks).sort()).toEqual([...BLANKS_STAGES].sort())
    expect(Object.keys(ALLOWED_TRANSITIONS.production).sort()).toEqual([...DOWNSTREAM_STAGES].sort())
  })

  it.each<[string, "artwork" | "blanks" | "production", string | null, string]>([
    ["same value is a no-op", "artwork", "approved", "approved"],
    ["null from (fresh order) is always allowed", "production", null, "delivered"],
    ["artwork forward", "artwork", "pending", "in_review"],
    ["artwork forward", "artwork", "in_review", "awaiting_approval"],
    ["artwork forward", "artwork", "awaiting_approval", "approved"],
    ["artwork rewind (changes requested)", "artwork", "awaiting_approval", "in_review"],
    ["artwork rewind (revised proof)", "artwork", "approved", "in_review"],
    ["blanks forward", "blanks", "not_started", "ordered"],
    ["blanks forward", "blanks", "ordered", "arrived"],
    ["blanks rewind (PO cancelled)", "blanks", "ordered", "not_started"],
    ["blanks rewind (short delivery)", "blanks", "arrived", "ordered"],
    ["production forward", "production", "received", "in_production"],
    ["production stock order ships straight away", "production", "received", "shipped"],
    ["production forward", "production", "in_production", "quality_check"],
    ["production rewind", "production", "in_production", "received"],
    ["production forward", "production", "quality_check", "shipped"],
    ["production rewind (QC fail)", "production", "quality_check", "in_production"],
    ["production forward", "production", "shipped", "delivered"],
  ])("allowed for everyone: %s %s %s→%s", (_label, track, from, to) => {
    for (const actor of [admin, pos, rule, customer, system]) ok(track, from, to, actor)
  })

  it.each<["artwork" | "blanks" | "production", string, string]>([
    ["artwork", "pending", "approved"], // skips the proof
    ["artwork", "in_review", "approved"], // no proof sent
    ["artwork", "pending", "awaiting_approval"],
    ["blanks", "not_started", "arrived"],
    ["production", "received", "quality_check"],
    ["production", "received", "delivered"],
    ["production", "shipped", "received"],
    ["production", "delivered", "shipped"],
  ])("blocked without override: %s %s→%s", (track, from, to) => {
    for (const actor of [admin, pos, rule, customer, system]) blocked(track, from, to, actor)
  })

  it("admin and POS fast-forward may override with a non-empty reason; rules, customers and system never can", () => {
    ok("artwork", "pending", "approved", admin, "customer approved by phone")
    ok("production", "received", "delivered", pos, "POS fast-forward")
    blocked("artwork", "pending", "approved", admin, "   ")
    blocked("artwork", "pending", "approved", rule, "rule says so")
    blocked("artwork", "pending", "approved", customer, "I insist")
    blocked("artwork", "pending", "approved", system, "cron")
  })

  it("an unknown from value is blocked rather than let through", () => {
    blocked("production", "art_review", "in_production", admin)
    ok("production", "art_review", "in_production", admin, "legacy value, moving on")
  })
})

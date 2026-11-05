import { toast } from "@medusajs/ui"

import type { NextActionKind } from "../../../lib/job-state"
import { pricerHref } from "../../lib/nav"

/** What a next action needs to know about its job, from either the panel or a Today row. */
export type ActionContext = {
  job_id: string
  order_id: string | null
  quote_id: string | null
  display_id: number | null
  /** Dollars owing (or the order total when nothing is paid). */
  outstanding: number | null
  /** Reloads the caller's view after an Undo. */
  refresh?: () => void
}

/**
 * A success toast with an Undo button, for moves with no outside effect (no
 * customer email, no shipment, no money). Undo is recorded like any change.
 */
// ponytail: 8 s is a guess from the review; the diary stays the place to fix anything later.
export function offerUndo(message: string, undo: () => Promise<unknown>, refresh?: () => void) {
  toast.success(message, {
    duration: 8000,
    action: {
      label: "Undo",
      altText: "Undo this change",
      onClick: async () => {
        try {
          await undo()
          toast.info("Undone")
        } catch (err: any) {
          toast.error(err?.message ?? "Couldn't undo. Change it back in the job.")
        } finally {
          refresh?.()
        }
      },
    },
  })
}

export type ActionOutcome =
  | { done: true }
  | { navigate: string }
  | { tab: "overview" | "artwork" | "production" | "delivery" | "activity"; focus?: string; open?: "convert" | "proof" | "blanks" }

const post = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json: json as any }
}

const setStage = async (orderId: string, patch: Record<string, string>) => {
  let r = await post(`/admin/orders/${orderId}/production-stage`, patch)
  if (r.status === 409 && r.json?.code === "production_not_ready") {
    const reasons: string[] = r.json?.failures ?? []
    const why = window.prompt(`Not ready: ${reasons.join("; ")}.\n\nStart anyway? Type a reason:`)
    if (!why || why.trim().length < 3) throw new Error("Not started")
    r = await post(`/admin/orders/${orderId}/production-stage`, { ...patch, override_reason: why.trim() })
  }
  if (!r.ok) throw new Error(r.json?.error ?? r.json?.message ?? `HTTP ${r.status}`)
}

/** One-click actions: the POST happens here. Everything else hands back where to go. */
export const ONE_CLICK: ReadonlySet<NextActionKind> = new Set([
  "send_proof",
  "mark_arrived",
  "start_production",
  "qc_done",
  "mark_shipped",
  "send_payment_link",
  "collected",
])

export async function performNextAction(ctx: ActionContext, kind: NextActionKind): Promise<ActionOutcome> {
  switch (kind) {
    case "reply":
    case "nudge_quote":
    case "nudge_payment":
    case "follow_up":
      return { tab: "activity", focus: "job-reply" }
    case "price_it":
      // The pricer opens over the job (Jobs list ?pricer=1).
      return { navigate: pricerHref(ctx.quote_id ?? ctx.job_id) }
    case "revise_design":
      // The quote tools (Studio, lines) are on the job window itself.
      return { tab: "overview", focus: "job-quote" }
    case "convert_to_order":
      return { tab: "overview", open: "convert" }
    case "send_payment_link": {
      if (!ctx.order_id) throw new Error("No order yet")
      const cents = Math.round((ctx.outstanding ?? 0) * 100)
      if (cents < 50) throw new Error("Nothing outstanding to charge.")
      const r = await post(`/admin/orders/${ctx.order_id}/payment-link`, {
        amount_cents: cents,
        scenario: "full",
        label: `Order #${ctx.display_id ?? ""}`.trim(),
      })
      if (!r.ok) throw new Error(r.json?.error ?? "Payment links aren't configured (STRIPE_PAYMENT_LINK_WEBHOOK_SECRET).")
      const url: string | undefined = r.json?.link?.url ?? r.json?.url
      if (url) {
        await navigator.clipboard?.writeText(url).catch(() => undefined)
        toast.success("Payment link created and copied. Paste it in your reply.")
      }
      return { tab: "activity", focus: "job-reply" }
    }
    case "send_proof":
      await setStage(ctx.order_id!, { artwork_stage: "awaiting_approval" })
      toast.success("Proof emailed to the customer")
      return { done: true }
    case "wait_proof":
    case "revise_proof":
      return { tab: "artwork", open: "proof" }
    case "get_sizes":
      return { tab: "overview", focus: "job-lines" }
    case "order_blanks":
      return { tab: "production", open: "blanks" }
    case "mark_arrived":
      await setStage(ctx.order_id!, { blanks_stage: "arrived" })
      offerUndo("Blanks marked arrived", () => setStage(ctx.order_id!, { blanks_stage: "ordered" }), ctx.refresh)
      return { done: true }
    case "start_production":
      await setStage(ctx.order_id!, { production_stage: "in_production" })
      toast.success("In production — customer emailed")
      return { done: true }
    case "qc_done":
      await setStage(ctx.order_id!, { production_stage: "quality_check" })
      offerUndo("QC done, ready to ship", () => setStage(ctx.order_id!, { production_stage: "in_production" }), ctx.refresh)
      return { done: true }
    case "mark_shipped":
      await setStage(ctx.order_id!, { production_stage: "shipped" })
      toast.success("Marked shipped — fulfilment created")
      return { done: true }
    case "collected": {
      // Walk-in stock sale: the POS fast-forward marks all three tracks done.
      const r = await post(`/admin/pos/orders/${ctx.order_id}/fast-forward`, { target: "delivered" })
      if (!r.ok) throw new Error(r.json?.message ?? r.json?.error ?? `HTTP ${r.status}`)
      toast.success("Marked collected")
      return { done: true }
    }
    default:
      return { done: true }
  }
}

/** "Take it": the signed-in admin becomes the job's owner (POST /admin/jobs/:id/owner); Undo clears it again. */
export async function takeJob(jobId: string, refresh?: () => void): Promise<void> {
  const path = `/admin/jobs/${encodeURIComponent(jobId)}/owner`
  const r = await post(path, {})
  if (!r.ok) {
    toast.error("Couldn't take the job")
    throw new Error(`HTTP ${r.status}`)
  }
  offerUndo(
    "It's yours. It's in Mine now.",
    async () => {
      const u = await fetch(path, { method: "DELETE", credentials: "include" })
      if (!u.ok) throw new Error(`HTTP ${u.status}`)
    },
    refresh
  )
}

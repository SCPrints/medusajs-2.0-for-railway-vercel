"use client"

import { useEffect, useState } from "react"

import { getDeliveryEta, setCartRushRequest, type RushRequest } from "@lib/data/delivery-estimate"
import { deliveryWindow, formatDeliveryWindow } from "@modules/cart/lib/delivery-window"

/**
 * "Estimated delivery: Tue 2 Dec – Fri 5 Dec" plus a "Need it sooner?" request.
 * The rush is a request only: nothing is priced or charged here, we confirm first.
 * Renders nothing if the production estimate can't be loaded.
 */
const DeliveryEstimate = ({ cartMetadata }: { cartMetadata?: Record<string, unknown> | null }) => {
  const [range, setRange] = useState<string | null>(null)
  const saved = cartMetadata?.rush_request as RushRequest | undefined
  const [tier, setTier] = useState<"" | "priority" | "express">(saved?.tier ?? "")
  const [neededBy, setNeededBy] = useState(saved?.needed_by ?? "")
  const [open, setOpen] = useState(Boolean(saved?.tier))
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  useEffect(() => {
    getDeliveryEta()
      .then((eta) => eta && setRange(formatDeliveryWindow(deliveryWindow(new Date(), eta))))
      .catch(() => undefined)
  }, [])

  const save = async (nextTier: typeof tier, nextDate: string) => {
    setState("saving")
    const res = await setCartRushRequest(
      nextTier ? { tier: nextTier, ...(nextDate ? { needed_by: nextDate } : {}) } : null
    )
    setState(res.ok ? "saved" : "error")
  }

  if (!range) return null

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3 text-sm" data-testid="delivery-estimate">
      <p className="font-semibold text-ui-fg-base">Estimated delivery: {range}</p>
      <p className="mt-1 text-xs text-ui-fg-subtle">
        Counted from when you approve your proof. Standard shipping, metro areas. Regional can take longer.
      </p>
      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-ui-fg-base">
            How fast?
            <select
              value={tier}
              onChange={(e) => {
                const v = e.target.value as typeof tier
                setTier(v)
                void save(v, neededBy)
              }}
              className="mt-1 block min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base"
            >
              <option value="">Standard</option>
              <option value="priority">Priority</option>
              <option value="express">Express</option>
            </select>
          </label>
          {tier ? (
            <label className="text-xs font-medium text-ui-fg-base">
              Needed by (optional)
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                onBlur={() => void save(tier, neededBy)}
                className="mt-1 block min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base"
              />
            </label>
          ) : null}
          {tier ? (
            <p className="text-xs text-ui-fg-subtle" aria-live="polite">
              We&apos;ll confirm the rush price before we print.{" "}
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved." : state === "error" ? "Could not save. Try again." : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4 hover:text-brand"
        >
          Need it sooner?
        </button>
      )}
    </div>
  )
}

export default DeliveryEstimate

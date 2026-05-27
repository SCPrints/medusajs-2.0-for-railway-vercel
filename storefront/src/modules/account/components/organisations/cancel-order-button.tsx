"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cancelOrganisationOrder } from "@lib/data/organisations"

type Props = {
  orgId: string
  orderId: string
  createdAt: string
  /** "owner" | "purchaser" | "viewer" */
  role: "owner" | "purchaser" | "viewer"
  /** If already cancelled, hide the button. */
  isCancelled?: boolean
}

const WINDOW_HOURS = 24

export default function CancelOrderButton({
  orgId,
  orderId,
  createdAt,
  role,
  isCancelled,
}: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isCancelled) return null
  if (role !== "owner" && role !== "purchaser") return null

  const ageMs = Date.now() - new Date(createdAt).getTime()
  const hoursElapsed = ageMs / (1000 * 60 * 60)
  if (hoursElapsed > WINDOW_HOURS) {
    return (
      <p className="text-xs text-ui-fg-muted">
        Cancellation window expired ({WINDOW_HOURS}h after placement). Contact
        SC Prints to cancel.
      </p>
    )
  }

  async function confirmCancel() {
    setSubmitting(true)
    setError(null)
    const res = await cancelOrganisationOrder(orgId, orderId)
    setSubmitting(false)
    if (res.ok) {
      setOpen(false)
      startTransition(() => router.refresh())
    } else {
      setError(res.error)
    }
  }

  const hoursLeft = Math.max(0, WINDOW_HOURS - hoursElapsed)

  return (
    <>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy || submitting}
          className="self-start rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 min-h-11"
        >
          Cancel order
        </button>
        <p className="text-xs text-ui-fg-muted">
          Available for {hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h` : "&lt; 1h"}{" "}
          more after placement.
        </p>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cancel order"
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => !submitting && setOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
            <div className="px-5 pt-5">
              <h3 className="text-lg font-semibold text-ui-fg-base">
                Cancel this order?
              </h3>
              <p className="mt-2 text-sm text-ui-fg-subtle">
                Reserved stock will be released back to inventory. This
                can&apos;t be undone — you&apos;ll need to place a new order if
                you change your mind.
              </p>
              {error ? (
                <p className="mt-3 text-sm text-rose-700">{error}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-ui-border-base px-5 py-3 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-full border border-ui-border-base px-4 py-2 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle disabled:opacity-50 min-h-11"
              >
                Keep order
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={submitting}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60 min-h-11"
              >
                {submitting ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

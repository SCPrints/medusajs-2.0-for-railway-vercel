"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { orderAgain, requestReorder, type NeedsStaffLine } from "@lib/data/orders"
import { phCapture } from "@lib/posthog"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Props = {
  orderId: string
  /** Only these lines; omit for every studio line on the order. */
  lineIds?: string[]
  label?: string
  variant?: "primary" | "secondary"
  className?: string
}

const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60"
const STYLES = {
  primary: `${BASE} bg-ink text-white hover:opacity-90`,
  secondary: `${BASE} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`,
}

/**
 * One-click "Order again": copies the studio lines into the cart at today's
 * prices (with the artwork our team approved) and goes to the cart. Lines
 * the cart can't take are listed with an "Ask us to re-order these" button.
 */
const OrderAgainButton = ({
  orderId,
  lineIds,
  label = "Order again",
  variant = "primary",
  className = "",
}: Props) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsStaff, setNeedsStaff] = useState<NeedsStaffLine[] | null>(null)
  const [added, setAdded] = useState(0)
  const [asked, setAsked] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    const res = await orderAgain(orderId, lineIds, countryCode)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    phCapture("order_again_clicked", {
      order_id: orderId,
      added_lines: res.added_lines,
      needs_staff: res.needs_staff.length,
    })
    if (res.needs_staff.length === 0 && res.added_lines > 0) {
      router.push(`/${countryCode}/cart`)
      return
    }
    setBusy(false)
    setAdded(res.added_lines)
    setNeedsStaff(res.needs_staff)
  }

  const ask = async () => {
    if (!needsStaff?.length) return
    setBusy(true)
    setError(null)
    const res = await requestReorder(
      orderId,
      needsStaff.map((l) => l.line_item_id)
    )
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    phCapture("reorder_request_sent", { order_id: orderId, from: "order_again" })
    setAsked(res.public_id)
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={STYLES[variant]}
        data-testid="order-again-button"
      >
        {busy && !needsStaff ? "Adding to cart…" : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {needsStaff ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
          {added > 0 ? (
            <p className="font-semibold">
              {added} line{added === 1 ? "" : "s"} added to your cart.
            </p>
          ) : null}
          {needsStaff.length > 0 ? (
            <>
              <p className={added > 0 ? "mt-2" : ""}>Our team needs to set these up:</p>
              <ul className="mt-1 list-disc pl-4">
                {needsStaff.map((l) => (
                  <li key={l.line_item_id}>
                    {l.title}
                    {l.reason ? ` (${l.reason})` : ""}
                  </li>
                ))}
              </ul>
              {asked ? (
                <p className="mt-2 font-semibold">
                  Sent. Job {asked}. We&apos;ll email you a quote.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={ask}
                  disabled={busy}
                  className={`${STYLES.secondary} mt-2 w-full`}
                >
                  {busy ? "Sending…" : "Ask us to re-order these"}
                </button>
              )}
            </>
          ) : (
            <p>Nothing on this order could be added to the cart.</p>
          )}
          {added > 0 ? (
            <LocalizedClientLink
              href="/cart"
              className={`${STYLES.primary} mt-2 w-full`}
            >
              Go to cart
            </LocalizedClientLink>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default OrderAgainButton

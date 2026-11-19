"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { orderAgain } from "@lib/data/orders"
import { phCapture } from "@lib/posthog"

type Props = {
  orderId: string
  /** Only these lines; omit for the whole order. */
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
 * One-click "Order again". Most jobs go straight into the cart (same
 * garments, sizes and the artwork our team approved) and on to the cart page.
 * A job our team needs to check first — something we set up by hand, or a
 * quoted price — is sent to us whole instead, and the customer gets a job
 * reference. Either way it's one button and one click.
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
  const [sent, setSent] = useState<{ ref: string; quoted: boolean } | null>(null)

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
      sent_to_team: Boolean(res.sent_to_team),
      approval_reason: res.approval_reason ?? null,
    })
    if (res.sent_to_team) {
      setBusy(false)
      setSent({ ref: res.sent_to_team, quoted: res.approval_reason === "quoted_price" })
      return
    }
    if (res.added_lines > 0) {
      router.push(`/${countryCode}/cart`)
      return
    }
    setBusy(false)
    setError("Nothing on this order could be re-ordered. Get in touch and we'll sort it out.")
  }

  if (sent) {
    return (
      <div
        className={`rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 ${className}`}
        role="status"
        data-testid="order-again-sent"
      >
        <p className="font-semibold">Got it. Your job reference is {sent.ref}.</p>
        <p className="mt-1 text-xs">
          {sent.quoted
            ? "This job was on a quoted price, so we'll confirm it and email you a link to pay."
            : "We set this job up for you, so we'll check the details and email you a link to pay."}
        </p>
      </div>
    )
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
        {busy ? "One moment…" : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default OrderAgainButton

"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { orderAgain, requestReorder } from "@lib/data/orders"
import { getReorderStock, type ReorderStockLine } from "@lib/data/reorder-stock"
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

  const [short, setShort] = useState<ReorderStockLine[] | null>(null)
  const [okIds, setOkIds] = useState<string[]>([])

  // Check stock first. If it can't be checked, carry on as before.
  const start = async () => {
    setBusy(true)
    setError(null)
    const stock = await getReorderStock(orderId, lineIds).catch(() => null)
    const bad = stock?.filter((l) => !l.ok) ?? []
    if (bad.length) {
      setBusy(false)
      setShort(bad)
      setOkIds(stock!.filter((l) => l.ok).map((l) => l.line_item_id))
      return
    }
    await run(lineIds)
  }

  const askUs = async () => {
    setBusy(true)
    const res = await requestReorder(orderId, lineIds)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setShort(null)
    setSent({ ref: res.public_id, quoted: false })
  }

  const run = async (ids?: string[]) => {
    setBusy(true)
    setError(null)
    setShort(null)
    const res = await orderAgain(orderId, ids, countryCode)
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

  if (short) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${className}`} data-testid="order-again-short">
        <p className="font-semibold">Some sizes are short on stock</p>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {short.map((l) => (
            <li key={l.line_item_id}>
              {l.title}
              {l.variant_title ? ` (${l.variant_title})` : ""} — you ordered {l.wanted}, {l.available} in stock.
              {l.suggestion
                ? ` Closest: ${l.suggestion.title}${l.suggestion.available != null ? `, ${l.suggestion.available} in stock` : ""}.`
                : ""}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {okIds.length ? (
            <button type="button" disabled={busy} onClick={() => run(okIds)} className={STYLES.primary}>
              Add what&apos;s available
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={askUs} className={STYLES.secondary}>
            Ask us to re-order
          </button>
        </div>
        {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={start}
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

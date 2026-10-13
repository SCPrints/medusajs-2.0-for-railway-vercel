"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"

import { requestCartQuote } from "@lib/data/cart-quote-request"

/**
 * Alternative to checkout: customers who want a proof first, or a payment link
 * / invoice, send the cart to staff as a quote (artwork + placements intact).
 */
const RequestQuote = ({ email: cartEmail }: { email?: string | null }) => {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(cartEmail ?? "")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; message?: string }>({
    status: "idle",
  })

  if (state.status === "sent") {
    return (
      <p className="rounded-lg bg-ui-bg-subtle p-3 text-sm text-ui-fg-base" role="status">
        Thanks — we&apos;ve got your cart (ref {state.message}). We&apos;ll email a proof and a secure payment link to{" "}
        <strong>{email}</strong>.
      </p>
    )
  }

  if (!open) {
    return (
      <Button variant="secondary" className="h-11 w-full" onClick={() => setOpen(true)} data-testid="request-quote-button">
        Email me a proof / quote instead
      </Button>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ status: "sending" })
    const res = await requestCartQuote({ email, phone, note })
    setState(res.ok ? { status: "sent", message: res.publicId } : { status: "error", message: res.error })
  }

  const input = "w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm min-h-11"

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <p className="text-sm text-ui-fg-subtle">
        We&apos;ll check your artwork, email a placement proof and send a secure payment link. Nothing is charged now.
      </p>
      <input className={input} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <input className={input} type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" />
      <textarea className={input} rows={3} placeholder="Anything we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" maxLength={2000} />
      {state.status === "error" ? <p className="text-sm text-rose-600" role="alert">{state.message}</p> : null}
      <Button type="submit" variant="secondary" className="h-11 w-full" isLoading={state.status === "sending"}>
        Send my cart for a quote
      </Button>
    </form>
  )
}

export default RequestQuote

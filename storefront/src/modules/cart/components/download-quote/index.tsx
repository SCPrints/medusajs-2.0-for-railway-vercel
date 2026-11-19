"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"

import { setCartEmailForQuote } from "@lib/data/cart-quote-pdf"

/**
 * "Download a quote": a formal PDF quote of the cart (ABN, GST, valid 30 days)
 * for customers who need paperwork before they can order. The cart is saved
 * as a quote so we can find it when they come back. Nobody is emailed.
 */
const DownloadQuote = ({ email: cartEmail }: { email?: string | null }) => {
  const [email, setEmail] = useState("")
  const [askEmail, setAskEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!cartEmail) {
        const saved = await setCartEmailForQuote(email)
        if (!saved.ok) return setError(saved.error)
      }
      const res = await fetch("/api/cart/quote-pdf")
      if (!res.ok) return setError((await res.text().catch(() => "")) || "We couldn't make your quote. Please try again.")
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "SC-Prints-quote.pdf"
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch {
      setError("We couldn't make your quote. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!cartEmail && !askEmail) {
    return (
      <Button variant="secondary" className="h-11 w-full" onClick={() => setAskEmail(true)} data-testid="download-quote-button">
        Download a quote (PDF)
      </Button>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void download()
      }}
    >
      {!cartEmail ? (
        <input
          className="min-h-11 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
          type="email"
          required
          autoFocus
          placeholder="Your email (goes on the quote)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
        />
      ) : null}
      <Button type="submit" variant="secondary" className="h-11 w-full" isLoading={busy} data-testid="download-quote-button">
        Download a quote (PDF)
      </Button>
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
      {done ? (
        <p className="text-sm text-ui-fg-subtle" role="status">
          Quote downloaded. It&apos;s valid for 30 days.
        </p>
      ) : null}
    </form>
  )
}

export default DownloadQuote

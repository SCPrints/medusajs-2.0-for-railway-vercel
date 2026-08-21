"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { MAX_AUTO_PRICED_STITCHES } from "@modules/embroidery/lib/pricing"

type PoaQuoteModalProps = {
  open: boolean
  /** Logged-in customer's email — prefills the field (still editable). */
  initialEmail?: string | null
  /** Over-cap embroidery sides, for the summary list. */
  poaSides: Array<{ side: string; stitchCount: number }>
  submitting?: boolean
  onClose: () => void
  onSubmit: (contact: { email: string; name?: string; note?: string }) => void
}

/**
 * Shown when the customer hits "Add to cart" with an embroidery design over the
 * auto-priced stitch cap (POA). Captures an email (guests type it, logged-in
 * customers get a prefill) and hands back to the add-to-cart flow, which posts
 * the finished design to /api/quote-bridge/poa — creating a quote in the staff
 * Kanban with the design attached instead of a cart line.
 *
 * Portal-rendered to <body> so it escapes transform containing blocks (same
 * reason CustomizerProductPicker portals) and sits above the bulk-grid overlay.
 */
export default function PoaQuoteModal({
  open,
  initialEmail,
  poaSides,
  submitting = false,
  onClose,
  onSubmit,
}: PoaQuoteModalProps) {
  const [email, setEmail] = useState(initialEmail ?? "")
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail((prev) => prev || initialEmail || "")
      setError(null)
    }
  }, [open, initialEmail])

  if (!open || typeof document === "undefined") return null

  const handleSubmit = () => {
    const trimmed = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("Please enter a valid email address.")
      return
    }
    onSubmit({
      email: trimmed,
      name: name.trim() || undefined,
      note: note.trim() || undefined,
    })
  }

  // z-[230]: must sit above the PDP studio overlay (z-200) and the
  // fly-to-cart thumb (z-210) — the modal portals to <body>, so it needs to
  // out-stack them explicitly.
  return createPortal(
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Request an embroidery quote"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={submitting ? undefined : onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-ui-fg-base">
          This design needs a custom quote
        </h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Embroidery over {MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches
          is priced individually by our team. Send us your design and
          we&apos;ll email you a price — usually within 1 business day.
        </p>
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {poaSides.map((s) => (
            <li key={s.side}>
              <span className="font-semibold capitalize">
                {s.side.replace(/_/g, " ")}
              </span>{" "}
              — ~{s.stitchCount.toLocaleString()} stitches
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="poa-quote-email"
              className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle"
            >
              Email *
            </label>
            <input
              id="poa-quote-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm focus:border-ui-fg-base focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="poa-quote-name"
              className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle"
            >
              Name (optional)
            </label>
            <input
              id="poa-quote-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm focus:border-ui-fg-base focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="poa-quote-note"
              className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle"
            >
              Anything we should know? (optional)
            </label>
            <textarea
              id="poa-quote-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Deadline, budget, thread colours…"
              className="mt-1 w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm focus:border-ui-fg-base focus:outline-none"
            />
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-ui-fg-base px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send quote request"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

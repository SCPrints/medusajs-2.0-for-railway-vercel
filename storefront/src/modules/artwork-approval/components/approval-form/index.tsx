"use client"

import { useEffect, useState, useTransition } from "react"

import {
  submitArtworkDecision,
  type ArtworkApprovalState,
} from "@lib/data/artwork-approval"

type Props = {
  orderId: string
  sig: string
  initial: ArtworkApprovalState
}

const ApprovalForm = ({ orderId, sig, initial }: Props) => {
  const [name, setName] = useState(initial.artwork_approver_name ?? "")
  const [comment, setComment] = useState("")
  const [status, setStatus] = useState<string | null>(initial.artwork_stage)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Tap/click-to-zoom: the garment shots are studio photos with a lot of
  // surrounding whitespace, so the inline render reads as "small". A lightbox
  // lets the customer open any mockup full-screen to check colours/placement.
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!zoomSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc(null)
    }
    document.addEventListener("keydown", onKey)
    // Lock body scroll while the overlay is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [zoomSrc])

  const alreadyApproved = status === "approved"

  const submit = (approved: boolean) => {
    setError(null)
    startTransition(async () => {
      const res = await submitArtworkDecision({
        order: orderId,
        sig,
        approved,
        approver_name: name.trim() || undefined,
        comment: comment.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStatus(res.status)
    })
  }

  return (
    <div className="rounded-2xl border border-[rgba(26,26,46,0.1)] bg-white/95 p-6 shadow-[0_4px_40px_rgba(26,26,46,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-secondary)]">
        Order
        {initial.order_display_id ? ` #${initial.order_display_id}` : ""}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--brand-primary)]">
        {alreadyApproved
          ? "Artwork approved"
          : status === "in_review"
            ? "Changes requested"
            : "Approve your artwork"}
      </h1>

      {initial.mockup_urls && initial.mockup_urls.length > 0 ? (
        <div className="mt-6 space-y-4">
          {initial.mockup_urls.map((img) => (
            <div key={img.side}>
              {img.side_label ? (
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-subtle">
                  {img.side_label}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setZoomSrc(img.url)}
                aria-label={`Enlarge ${img.side_label ?? img.side} mockup`}
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-[rgba(26,26,46,0.08)]"
              >
                <img
                  src={img.url}
                  alt={img.side_label ?? img.side}
                  className="w-full transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-90 backdrop-blur-sm">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
                  </svg>
                  Tap to enlarge
                </span>
              </button>
              {img.print_dimension ? (
                <p className="mt-1.5 text-sm text-[var(--brand-primary)]">
                  <span className="font-semibold">Print size:</span> {img.print_dimension}
                </p>
              ) : null}
              {img.note ? (
                <p className="mt-1.5 text-sm text-[var(--brand-primary)]">
                  <span className="font-semibold">Studio note:</span> {img.note}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-ui-fg-subtle">
            Tap any image to enlarge it and check colours and placement.
          </p>
        </div>
      ) : initial.latest_photo_url ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setZoomSrc(initial.latest_photo_url)}
            aria-label="Enlarge proof preview"
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-[rgba(26,26,46,0.08)]"
          >
            <img
              src={initial.latest_photo_url}
              alt="Proof preview"
              className="w-full transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-90 backdrop-blur-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
              </svg>
              Tap to enlarge
            </span>
          </button>
          <p className="mt-2 text-xs text-ui-fg-subtle">
            {initial.revised_proof_note
              ? `Studio note: ${initial.revised_proof_note}`
              : "Revised proof from our studio. Tap the image to enlarge and check colours and placement."}
          </p>
        </div>
      ) : null}

      {alreadyApproved ? (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">
            Approved
            {initial.artwork_approver_name
              ? ` by ${initial.artwork_approver_name}`
              : ""}
            {initial.artwork_approved_at
              ? ` on ${new Date(initial.artwork_approved_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`
              : ""}
            . We&apos;re cracking on with production.
          </p>
        </div>
      ) : (
        <>
          <hr className="my-6 border-[rgba(26,26,46,0.08)]" />

          <label
            htmlFor="approver"
            className="block text-sm font-semibold text-[var(--brand-primary)]"
          >
            Your name
          </label>
          <input
            id="approver"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="So we can record who signed it off"
            className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-[var(--brand-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-secondary)] tablet:text-sm"
          />

          <label
            htmlFor="comment"
            className="mt-4 block text-sm font-semibold text-[var(--brand-primary)]"
          >
            Notes (optional)
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-[var(--brand-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-secondary)] tablet:text-sm"
            placeholder="Anything we should know? Colour tweaks, placement notes, etc."
          />

          {error ? (
            <p className="mt-3 text-sm text-rose-700">{error}</p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-end tablet:gap-2">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={pending}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-ui-border-base bg-white px-4 py-3 text-base font-semibold text-[var(--brand-primary)] hover:bg-ui-bg-subtle disabled:opacity-60 tablet:w-auto tablet:py-2 tablet:text-sm"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={pending}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--brand-primary)] px-5 py-3 text-base font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60 tablet:w-auto tablet:py-2 tablet:text-sm"
            >
              Approve and send to print
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-ui-fg-muted">
        This link is unique to your order. If you didn&apos;t expect this
        email, just ignore it.
      </p>

      {/* Full-screen zoom lightbox — tap/click anywhere or press Escape to close.
          The image is object-contain so the whole garment fits; on touch the
          browser's native pinch-zoom works on top for fine detail. */}
      {zoomSrc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged artwork preview"
          onClick={() => setZoomSrc(null)}
          className="fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center bg-black/85 p-4"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setZoomSrc(null)
            }}
            aria-label="Close enlarged view"
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomSrc}
            alt="Enlarged artwork preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[96vw] w-auto rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  )
}

export default ApprovalForm

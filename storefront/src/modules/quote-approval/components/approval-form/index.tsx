"use client"

import { useState, useTransition } from "react"

import {
  submitQuoteDesignDecision,
  type QuoteApprovalState,
} from "@lib/data/quote-approval"

type Props = {
  quoteId: string
  sig: string
  initial: QuoteApprovalState
}

const ApprovalForm = ({ quoteId, sig, initial }: Props) => {
  const [name, setName] = useState(initial.design_approver_name ?? "")
  const [comment, setComment] = useState("")
  const [status, setStatus] = useState<string | null>(
    initial.design_approval_status
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const alreadyApproved = status === "approved"
  const changesRequested = status === "changes_requested"

  const submit = (approved: boolean) => {
    setError(null)
    startTransition(async () => {
      const res = await submitQuoteDesignDecision({
        quote: quoteId,
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
        Quote
        {initial.public_id ? ` ${initial.public_id}` : ""}
        {initial.company ? ` · ${initial.company}` : ""}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--brand-primary)]">
        {alreadyApproved
          ? "Design approved"
          : changesRequested
            ? "Changes requested"
            : "Approve your design"}
      </h1>
      <p className="mt-2 text-sm text-ui-fg-subtle">
        Here&apos;s the mockup we&apos;ve put together for your quote. Have a
        look and let us know if it&apos;s good to go.
      </p>

      {initial.mockup_urls && initial.mockup_urls.length > 0 ? (
        <div className="mt-6 space-y-4">
          {initial.mockup_urls.map((img, i) => (
            <div key={`${img.url}-${i}`}>
              {img.side_label ? (
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-subtle">
                  {img.side_label}
                </p>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.side_label ?? img.side}
                className="w-full rounded-lg border border-[rgba(26,26,46,0.08)]"
              />
            </div>
          ))}
          <p className="text-xs text-ui-fg-subtle">
            Zoom in on a phone to check colours and placement.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No mockup has been attached to this quote yet. Please check back
            once our team has sent it through.
          </p>
        </div>
      )}

      {alreadyApproved ? (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">
            Approved
            {initial.design_approver_name
              ? ` by ${initial.design_approver_name}`
              : ""}
            {initial.design_approved_at
              ? ` on ${new Date(initial.design_approved_at).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "short", year: "numeric" }
                )}`
              : ""}
            . Thanks — we&apos;ll be in touch with next steps.
          </p>
        </div>
      ) : (
        <>
          {changesRequested && initial.design_changes_comment ? (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                You asked for: {initial.design_changes_comment}
              </p>
            </div>
          ) : null}

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
            placeholder="Anything we should change? Colour tweaks, placement, sizing notes, etc."
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
              Approve design
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-ui-fg-muted">
        This link is unique to your quote. If you didn&apos;t expect this, just
        ignore it.
      </p>
    </div>
  )
}

export default ApprovalForm

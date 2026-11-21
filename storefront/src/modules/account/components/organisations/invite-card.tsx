"use client"

import { useState } from "react"

import { acceptOrgInvite, type InvitePreview } from "@lib/data/identity"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function InviteCard({ token, preview }: { token: string; preview: InvitePreview | null }) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!preview) {
    return (
      <div data-testid="invite-card">
        <h1 className="text-2xl font-semibold">This invitation isn't available</h1>
        <p className="mt-2 text-sm text-ui-fg-subtle">It may have expired, been used, or been cancelled. Ask the organisation's owner to send a new one.</p>
      </div>
    )
  }
  if (done) {
    return (
      <div data-testid="invite-card">
        <h1 className="text-2xl font-semibold">You've joined {preview.organisation.name}</h1>
        <LocalizedClientLink href="/account/organisations" className="mt-4 inline-flex min-h-11 items-center underline">
          Go to my organisations
        </LocalizedClientLink>
      </div>
    )
  }
  return (
    <div data-testid="invite-card">
      <h1 className="text-2xl font-semibold">Join {preview.organisation.name}</h1>
      <p className="mt-2 text-sm text-ui-fg-subtle">You've been invited as {preview.role_label}.</p>
      {preview.problem === "wrong_email" && (
        <p className="mt-4 text-sm text-rose-600">This invitation was sent to {preview.email}. Sign out and sign in with that address, then open the link again.</p>
      )}
      {preview.problem === "unverified" && (
        <p className="mt-4 text-sm text-rose-600">Confirm your email first (we sent you a link), then open this invitation again.</p>
      )}
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {!preview.problem && (
        <button
          type="button"
          disabled={busy}
          className="mt-4 min-h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={async () => {
            setBusy(true)
            const r = await acceptOrgInvite(token)
            setBusy(false)
            if (r.ok) setDone(true)
            else setError(r.error)
          }}
        >
          Accept invitation
        </button>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"

import { confirmEmail } from "@lib/data/identity"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/** Confirms on load (client side, so email scanners that only fetch the page don't confirm for the customer). */
export default function VerifyEmail(p: { email: string; exp: string; sig: string }) {
  const [state, setState] = useState<"working" | "confirmed" | "expired" | "invalid">("working")
  useEffect(() => {
    confirmEmail(p).then(setState)
  }, [p.email, p.exp, p.sig])

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/95 p-6" data-testid="verify-email">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {state === "working" ? "Confirming..." : state === "confirmed" ? "Email confirmed" : "This link has expired"}
      </h1>
      <p className="mt-2 text-sm text-ui-fg-subtle">
        {state === "confirmed"
          ? "Thanks. Your quotes will now show in your account."
          : state === "working"
            ? "One moment."
            : "Sign in and send a new link from your account."}
      </p>
      <LocalizedClientLink href="/account" className="mt-4 inline-flex min-h-11 items-center underline">
        Go to my account
      </LocalizedClientLink>
    </div>
  )
}

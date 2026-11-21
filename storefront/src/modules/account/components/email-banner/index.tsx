import { getEmailStatus } from "@lib/data/identity"

import ResendButton from "./resend-button"

/** Shown on every account page until the sign-up email is confirmed. */
export default async function EmailBanner() {
  const status = await getEmailStatus()
  if (!status || status.verified) return null
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="email-confirm-banner">
      Confirm your email to see your quotes. We sent a link to {status.email}. <ResendButton />
    </div>
  )
}

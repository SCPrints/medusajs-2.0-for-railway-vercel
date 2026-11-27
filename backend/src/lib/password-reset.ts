/**
 * Where an emailed password-reset link points: the shop for customers, the
 * admin for staff. Null when it can't be built (no STOREFRONT_URL, or an actor
 * type we don't email). Medusa makes the token: one use, 15 minutes.
 */
export function passwordResetUrl(actorType: string, token: string, email: string): string | null {
  if (!token || !email) return null
  const query = `token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  if (actorType === "user") {
    const fly = process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : ""
    const admin = (process.env.ADMIN_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || fly).replace(/\/+$/, "")
    return admin ? `${admin}/app/reset-password?${query}` : null
  }
  if (actorType !== "customer") return null
  const shop = process.env.STOREFRONT_URL?.replace(/\/+$/, "")
  if (!shop) return null
  const cc = process.env.STOREFRONT_DEFAULT_COUNTRY_CODE
  return `${shop}${cc ? `/${cc}` : ""}/reset-password?${query}`
}

export const PASSWORD_RESET_SUBJECT = "Reset your SC Prints password"

/** The whole email: a line, one button, small print. Kept here so the test and the sender agree. */
export function passwordResetMessage(url: string) {
  return {
    body: "Someone asked to reset the password for this email address at SC Prints. If that was you, use the button below to choose a new one.",
    button: { label: "Choose a new password", url },
    footnote: "The button works once and lasts 15 minutes. If you didn't ask for this, ignore this email and your password stays the same.",
    signature: "SC Prints",
  }
}

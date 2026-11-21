import { Modules } from "@medusajs/framework/utils"

import { countSend, verificationUrl } from "../../lib/email-verification"
import { SUPPORT_REPLY_TO_EMAIL } from "../../lib/constants"
import { EmailTemplates } from "../../modules/email-notifications/templates"

/**
 * Sends the "confirm your email" link, counted against the daily limit.
 * Returns "sent" | "limit" | "skipped" (nothing to send, or no storefront URL).
 * The customer's own sign-up / button press asked for this email.
 */
export async function sendVerificationEmail(container: any, customerId: string): Promise<"sent" | "limit" | "skipped"> {
  const customers = container.resolve(Modules.CUSTOMER) as any
  const customer = await customers.retrieveCustomer(customerId)
  const email = String(customer?.email ?? "").trim().toLowerCase()
  const url = email ? verificationUrl(email) : null
  if (!url) return "skipped"
  const metadata = countSend(customer.metadata)
  if (!metadata) return "limit"
  await customers.updateCustomers(customerId, { metadata })
  const notifications = container.resolve(Modules.NOTIFICATION) as any
  // A mail failure must not 500 the "send it again" button or the sign-up subscriber.
  const sent = await notifications.createNotifications({
    to: email,
    channel: "email",
    template: EmailTemplates.CUSTOMER_MESSAGE,
    data: {
      emailOptions: { subject: "Confirm your email for SC Prints", ...(SUPPORT_REPLY_TO_EMAIL ? { replyTo: SUPPORT_REPLY_TO_EMAIL } : {}) },
      message: {
        body: `Thanks for signing up. Tap this link to confirm your email:\n\n${url}\n\nIt works for 7 days. Once it's confirmed you'll see your quotes in your account. If you didn't sign up, you can ignore this email.`,
        signature: "SC Prints",
      },
    },
  }).then(() => true, () => false)
  return sent ? "sent" : "skipped"
}

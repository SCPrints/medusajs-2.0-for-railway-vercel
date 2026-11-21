import { Modules } from "@medusajs/framework/utils"
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { isEmailVerified } from "../lib/email-verification"
import { sendVerificationEmail } from "../services/customer-verification/send"

/**
 * New sign-ups are stamped `email_verification_required` by middleware at
 * creation (so there is no unverified-but-unflagged window). This sends the one
 * confirm-your-email link. Guest and staff-created customers have no flag.
 */
export default async function customerCreatedSendVerification({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  try {
    const customer: any = await (container.resolve(Modules.CUSTOMER) as any).retrieveCustomer(data.id)
    if (!customer?.has_account || isEmailVerified(customer)) return
    await sendVerificationEmail(container, data.id)
  } catch (err) {
    console.error("customer-created-send-verification failed", err)
  }
}

export const config: SubscriberConfig = { event: "customer.created" }

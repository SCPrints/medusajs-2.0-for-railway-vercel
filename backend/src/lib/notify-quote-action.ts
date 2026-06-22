import type {
  INotificationModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { ADMIN_PUBLIC_URL, BACKEND_URL, CONTACT_NOTIFICATION_EMAIL } from "./constants"
import { EmailTemplates } from "../modules/email-notifications/templates"
import type { QuoteCustomerActionKind } from "../modules/email-notifications/templates/quote-customer-action"

/**
 * Email staff when a customer acts on a quote (approves / requests changes on
 * the design, or accepts the quote). Recipients: the quote's `assigned_to`
 * (if set) plus `CONTACT_NOTIFICATION_EMAIL`. Best-effort — a notification
 * failure never blocks the customer's action.
 */
export async function notifyQuoteCustomerAction(
  container: MedusaContainer,
  input: {
    quote: {
      id: string
      public_id?: string | null
      email?: string | null
      company?: string | null
      assigned_to?: string | null
    }
    action: QuoteCustomerActionKind
    comment?: string | null
  }
): Promise<void> {
  const recipients = Array.from(
    new Set(
      [input.quote.assigned_to, CONTACT_NOTIFICATION_EMAIL]
        .map((e) => (typeof e === "string" ? e.trim() : ""))
        .filter(Boolean)
    )
  )
  if (recipients.length === 0) return

  try {
    const notificationModuleService: INotificationModuleService =
      container.resolve(Modules.NOTIFICATION)
    const adminBase = (ADMIN_PUBLIC_URL || BACKEND_URL || "").replace(/\/$/, "")
    const quoteUrl = adminBase ? `${adminBase}/app/quotes` : null

    await Promise.all(
      recipients.map((to) =>
        notificationModuleService.createNotifications({
          to,
          channel: "email",
          template: EmailTemplates.QUOTE_CUSTOMER_ACTION,
          data: {
            alert: {
              publicId: input.quote.public_id ?? input.quote.id,
              customerEmail: input.quote.email ?? null,
              company: input.quote.company ?? null,
              action: input.action,
              comment: input.comment ?? null,
              quoteUrl,
            },
          },
        })
      )
    )
  } catch {
    // best-effort — never fail the customer's action over a staff notification
  }
}

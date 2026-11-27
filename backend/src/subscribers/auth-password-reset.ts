import { Modules } from "@medusajs/framework/utils"
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { SUPPORT_REPLY_TO_EMAIL } from "../lib/constants"
import { PASSWORD_RESET_SUBJECT, passwordResetMessage, passwordResetUrl } from "../lib/password-reset"
import { EmailTemplates } from "../modules/email-notifications/templates"

/**
 * Emails the password-reset link. Medusa's own "forgot password" routes make
 * the one-use token and emit this event; until 28 Nov 2026 nothing listened,
 * so neither customers nor staff could ever reset a password.
 * Never logs the token, and never throws: a mail failure must not surface to
 * the visitor (the route answers the same whether or not the account exists).
 */
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; actor_type: string; token: string }>) {
  const logger = container.resolve("logger") as { warn: (m: string) => void; error: (m: string) => void }
  const email = String(data?.entity_id ?? "").trim()
  const url = passwordResetUrl(data?.actor_type, data?.token, email)
  if (!url) {
    logger.warn(`[password-reset] no link built for a ${data?.actor_type} reset (STOREFRONT_URL / BACKEND_PUBLIC_URL unset?)`)
    return
  }
  try {
    await (container.resolve(Modules.NOTIFICATION) as any).createNotifications({
      to: email,
      channel: "email",
      template: EmailTemplates.CUSTOMER_MESSAGE,
      data: {
        emailOptions: { subject: PASSWORD_RESET_SUBJECT, ...(SUPPORT_REPLY_TO_EMAIL ? { replyTo: SUPPORT_REPLY_TO_EMAIL } : {}) },
        message: passwordResetMessage(url),
      },
    })
  } catch (err: any) {
    logger.error(`[password-reset] email to a ${data?.actor_type} failed: ${err?.message ?? err}`)
  }
}

export const config: SubscriberConfig = { event: "auth.password_reset" }

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { CONTACT_NOTIFICATION_EMAIL } from "../../../lib/constants"
import { EmailTemplates } from "../../../modules/email-notifications/templates"

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024

/**
 * Staff "Suggestion" button (admin/widgets/suggestion-button.tsx). Saves the
 * page screenshot to the file store and emails the suggestion to
 * SUGGESTIONS_EMAIL (falls back to CONTACT_NOTIFICATION_EMAIL).
 * ponytail: the email is the record; add a table + admin list if staff
 * volume ever needs triage beyond an inbox.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : ""
  if (!message) return res.status(400).json({ error: "Write your suggestion first." })

  const pageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 1000) : null
  const pageTitle = typeof body.page_title === "string" ? body.page_title.slice(0, 200) : null

  const recipient = process.env.SUGGESTIONS_EMAIL || CONTACT_NOTIFICATION_EMAIL
  if (!recipient) return res.status(503).json({ error: "No inbox is set up for suggestions." })

  const actor = (req as any).auth_context?.actor_id as string | undefined
  const user = actor?.startsWith("user_")
    ? await (req.scope.resolve(Modules.USER) as any).retrieveUser(actor).catch(() => null)
    : null
  const from =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || actor || "Staff"

  let screenshotUrl: string | null = null
  const match =
    typeof body.screenshot === "string"
      ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(body.screenshot)
      : null
  if (match && (match[2].length * 3) / 4 <= MAX_SCREENSHOT_BYTES) {
    try {
      const ext = match[1] === "png" ? "png" : "jpg"
      const [file] = await (req.scope.resolve(Modules.FILE) as any).createFiles([
        {
          filename: `staff-suggestions/${Date.now()}.${ext}`,
          mimeType: `image/${match[1]}`,
          content: match[2],
        },
      ])
      screenshotUrl = file?.url ?? null
    } catch (err) {
      // A failed upload must not lose the suggestion itself.
      console.error("Suggestion screenshot upload failed", err)
    }
  }

  await (req.scope.resolve(Modules.NOTIFICATION) as any).createNotifications({
    to: recipient,
    channel: "email",
    template: EmailTemplates.STAFF_SUGGESTION,
    data: {
      emailOptions: {
        subject: `Suggestion from ${from}${pageTitle ? ` — ${pageTitle}` : ""}`,
        ...(user?.email ? { replyTo: user.email } : {}),
      },
      suggestion: { message, from, pageUrl, pageTitle, screenshotUrl },
    },
  })

  res.json({ ok: true, screenshot_url: screenshotUrl })
}

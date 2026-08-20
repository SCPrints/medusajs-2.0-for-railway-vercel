import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INotificationModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"
import { CONTACT_NOTIFICATION_EMAIL, MINIO_PUBLIC_URL } from "../../lib/constants"
import {
  createContactSubmission,
  type ContactAttachment,
} from "../../lib/contact-submissions"
import { isValidEmail } from "../../lib/email-validation"
import { getPostHog } from "../../lib/posthog"
import { getStorefrontOriginAllowlist } from "../../lib/storefront-origins"
import { EmailTemplates } from "../../modules/email-notifications/templates"

const MAX_ATTACHMENTS = 3

/**
 * Accept only attachment URLs that point at OUR object storage — the URLs come
 * from the client, so never echo an attacker-supplied arbitrary link into the
 * staff notification email. (Uploads land via /store/contact/attachments, which
 * returns MINIO_PUBLIC_URL-prefixed URLs.)
 */
function parseAttachments(raw: unknown): ContactAttachment[] {
  if (!Array.isArray(raw)) return []
  const publicBase = MINIO_PUBLIC_URL?.replace(/\/+$/, "") || null
  const out: ContactAttachment[] = []
  for (const item of raw) {
    if (out.length >= MAX_ATTACHMENTS) break
    if (!item || typeof item !== "object") continue
    const a = item as Record<string, unknown>
    const url = typeof a.url === "string" ? a.url.trim() : ""
    const trusted = publicBase ? url.startsWith(`${publicBase}/`) : url.startsWith("https://")
    if (!url || !trusted) continue
    const fileName =
      typeof a.fileName === "string" && a.fileName.trim()
        ? a.fileName.trim().slice(0, 255)
        : "attachment"
    const mimeType = typeof a.mimeType === "string" ? a.mimeType.trim().slice(0, 150) || null : null
    const bytes =
      typeof a.bytes === "number" && Number.isFinite(a.bytes) ? Math.max(0, Math.floor(a.bytes)) : null
    out.push({ url, fileName, mimeType, bytes })
  }
  return out
}

function getAllowedOrigins() {
  return new Set(getStorefrontOriginAllowlist())
}

function setManualCors(req: MedusaRequest, res: MedusaResponse) {
  const origin = req.headers.origin
  const allowedOrigins = getAllowedOrigins()

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-publishable-api-key")
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setManualCors(req, res)
  return res.status(204).send()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setManualCors(req, res)

  const body = (req.body ?? {}) as Record<string, unknown>
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : null
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : null
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : ""
  const subject = typeof body.subject === "string" ? body.subject.trim() : null
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const attachments = parseAttachments(body.attachments)

  if (!email || !message) {
    return res.status(400).json({
      success: false,
      message: "Email and message are required",
    })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    })
  }

  // ponytail: digit count only — international formats vary too much to regex.
  if ((phone.match(/\d/g)?.length ?? 0) < 8) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid phone number.",
    })
  }

  const submissionId = ulid()
  const sourceIpHeader = req.headers["x-forwarded-for"]
  const sourceIp = Array.isArray(sourceIpHeader)
    ? sourceIpHeader[0] ?? null
    : sourceIpHeader?.split(",")?.[0]?.trim() ?? null
  const sourceOrigin = req.headers.origin ?? null
  const userAgent = req.headers["user-agent"] ?? null

  try {
    await createContactSubmission({
      id: submissionId,
      firstName,
      lastName,
      email,
      phone,
      subject,
      message,
      sourceOrigin,
      sourceIp,
      userAgent,
      attachments,
    })
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to persist contact submission: ${error instanceof Error ? error.message : "unknown error"}`
    )
  }

  const notificationRecipient = CONTACT_NOTIFICATION_EMAIL?.trim()

  if (notificationRecipient) {
    try {
      const notificationModuleService: INotificationModuleService = req.scope.resolve(Modules.NOTIFICATION)

      await notificationModuleService.createNotifications({
        to: notificationRecipient,
        channel: "email",
        template: EmailTemplates.CONTACT_SUBMISSION,
        data: {
          emailOptions: {
            subject: subject
              ? `New contact submission: ${subject}`
              : "New contact form submission",
            replyTo: email,
          },
          submission: {
            id: submissionId,
            firstName,
            lastName,
            email,
            phone,
            subject,
            message,
            sourceOrigin,
            sourceIp,
            userAgent,
            attachments,
          },
          preview: "A new contact form submission was received.",
        },
      })
    } catch (error) {
      console.error("Failed to send contact submission notification", error)
    }
  } else {
    console.warn("CONTACT_NOTIFICATION_EMAIL is not configured; contact notification email skipped")
  }

  console.log("Contact submission received", { submissionId, email, subject })

  getPostHog()?.capture({
    distinctId: email,
    event: "contact form submitted",
    properties: {
      submission_id: submissionId,
      subject: subject ?? null,
      source_origin: sourceOrigin ?? null,
      attachment_count: attachments.length,
      $set: { email },
    },
  })

  return res.status(200).json({
    success: true,
    message: "Data received by backend",
    id: submissionId,
  })
}
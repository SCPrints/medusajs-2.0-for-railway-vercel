import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INotificationModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"
import { CONTACT_NOTIFICATION_EMAIL, MINIO_PUBLIC_URL, ORDER_INBOX_DOMAIN } from "../../lib/constants"
import { quoteInboxAddress } from "../../lib/order-inbox-alias"
import { adminJobUrl, startJobFromEnquiry } from "../../services/jobs/start-from-enquiry"
import {
  createContactSubmission,
  type ContactAttachment,
} from "../../lib/contact-submissions"
import { fillCustomerBlanks } from "../../lib/customer-contact-backfill"
import { isValidEmail } from "../../lib/email-validation"
import { LEAD_RELAY_REJECTED, readLeadRelay } from "../../lib/lead-relay"
import { findOpenCarts } from "../../lib/open-carts"
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

  const relay = readLeadRelay(req)
  if (!relay.ok) return res.status(403).json(LEAD_RELAY_REJECTED)

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
  // The relay forwards the visitor's own IP / browser (else we'd log Vercel's).
  const sourceIp = relay.clientIp
  const sourceOrigin = req.headers.origin ?? (relay.ok ? "scprints.com.au form" : null)
  const userAgent = relay.userAgent

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

  // Every enquiry is a job from the moment it lands (Jobs list → New). Never
  // fail the form over it: the submission is saved and staff are emailed.
  const job = await startJobFromEnquiry(req.scope, {
    id: submissionId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    subject,
    message,
    attachments,
    bot: relay.bot,
  }).catch((error) => {
    console.error("Contact submission: creating the job failed", error)
    return null
  })

  await fillCustomerBlanks(req.scope, email, { first_name: firstName, last_name: lastName, phone })

  const notificationRecipient = CONTACT_NOTIFICATION_EMAIL?.trim()

  // Customers often enquire about designs sitting in their cart — attach any
  // open carts for this email so staff see the artwork without digging.
  const carts = await findOpenCarts(req.scope, { q: email, limit: 3 }).catch((error) => {
    console.error("Open-cart lookup for contact submission failed", error)
    return []
  })
  const cartTag = `${relay.bot ? "[⚠ Possible bot] " : ""}${carts.length ? `[Has cart $${carts[0].item_total.toFixed(2)}] ` : ""}`

  if (notificationRecipient) {
    try {
      const notificationModuleService: INotificationModuleService = req.scope.resolve(Modules.NOTIFICATION)

      await notificationModuleService.createNotifications({
        to: notificationRecipient,
        channel: "email",
        template: EmailTemplates.CONTACT_SUBMISSION,
        data: {
          emailOptions: {
            subject: `${cartTag}${subject ? `New contact submission: ${subject}` : "New contact form submission"}`,
            // Replying from Gmail goes to the customer AND the job's own
            // address, so the answer shows on the job too.
            replyTo: job && ORDER_INBOX_DOMAIN ? [email, quoteInboxAddress(job.quote_id)!] : email,
          },
          jobUrl: job ? adminJobUrl(job.quote_id) : null,
          carts,
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
      job_quote_id: job?.quote_id ?? null,
      subject: subject ?? null,
      source_origin: sourceOrigin ?? null,
      attachment_count: attachments.length,
      open_cart_count: carts.length,
      bot_flagged: relay.bot,
      $set: { email },
    },
  })

  return res.status(200).json({
    success: true,
    message: "Data received by backend",
    id: submissionId,
  })
}
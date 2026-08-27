import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"
import { z } from "zod"

import {
  CONTACT_NOTIFICATION_EMAIL,
  SUPPORT_REPLY_TO_EMAIL,
} from "../../../../lib/constants"
import { isValidEmail } from "../../../../lib/email-validation"
import { MAX_AUTO_PRICED_STITCHES } from "../../../../lib/embroidery-pricing"
import { getPostHog } from "../../../../lib/posthog"
import {
  mapQuoteDesignLines,
  quoteDesignLineSchema,
} from "../../../../lib/quote-design-lines"
import { archiveLineDesigns } from "../../../../lib/side-layouts-archive"
import { EmailTemplates } from "../../../../modules/email-notifications/templates"
import { QUOTE_MODULE } from "../../../../modules/quote"
import type QuoteModuleService from "../../../../modules/quote/service"

/**
 * POST /store/quotes/poa-request
 *   body: { email, contact_name?, note?, group_id, product_title?,
 *           poa_sides: [{ side, stitch_count }], lines: QuoteDesignLine[] }
 *   → 201 { success, quote_id, public_id }
 *
 * Customer-initiated sibling of the staff "Design in Studio" relay. When an
 * embroidery design exceeds MAX_AUTO_PRICED_STITCHES the customizer blocks
 * add-to-cart and posts the finished design here instead (via the storefront's
 * /api/quote-bridge/poa relay). Creates a `new` quote carrying the full
 * customizerDesign lines — same persisted shape as design-items — so it lands
 * in the admin Kanban ready to price, with "Edit design in Studio" working.
 *
 * Auth: public, like POST /store/quotes — it's a lead-capture form. The
 * storefront relay rate-limits; lines carry no trusted pricing (unit_price is
 * null, staff set it).
 */
const bodySchema = z.object({
  email: z.string().min(3).max(320),
  // Required in the storefront modal; optional here so a deploy-order skew
  // (old storefront, new backend) can never drop a POA lead over a missing
  // field. Server-side clients should still send it.
  contact_phone: z.string().max(40).optional(),
  contact_name: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  group_id: z.string().min(1).max(80),
  product_title: z.string().max(300).optional(),
  poa_sides: z
    .array(
      z.object({
        side: z.string().max(40),
        stitch_count: z.number().int().min(0).max(10_000_000),
      })
    )
    .min(1)
    .max(10),
  lines: z.array(quoteDesignLineSchema).min(1).max(100),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(req.body ?? {})
  } catch (err: any) {
    return res
      .status(400)
      .json({ success: false, message: err?.message ?? "Invalid request" })
  }

  const email = parsed.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Please enter a valid email address." })
  }

  const quoteService = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`

  // Logged-in customer (optional-auth middleware, see middlewares.ts): stamp
  // the quote onto their record and backfill name/phone from the profile when
  // the modal left them blank. The token is the proof of identity — a body
  // field would let anyone attach quotes to arbitrary customers.
  const customerId =
    (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ??
    null
  let contactName = parsed.contact_name?.trim() || null
  let contactPhone = parsed.contact_phone?.trim() || null
  if (customerId && (!contactName || !contactPhone)) {
    try {
      const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
      const cust = await customerModule.retrieveCustomer(customerId)
      contactName =
        contactName ||
        [cust?.first_name, cust?.last_name].filter(Boolean).join(" ") ||
        null
      contactPhone = contactPhone || cust?.phone || null
    } catch {
      // Profile lookup is best-effort — the quote still creates.
    }
  }

  // POA lines carry no trusted price — staff set unit_price on the quote.
  const newLines = mapQuoteDesignLines(
    parsed.lines.map((l) => ({ ...l, unit_price_cents: null })),
    parsed.group_id
  )
  // Heavy vector sideLayouts → R2, deduped across size lines (see lib).
  await archiveLineDesigns(req.scope, newLines, `poa-${publicId}`)

  const totalQuantity = newLines.reduce((sum, l) => sum + (l.quantity ?? 0), 0)
  const sideSummary = parsed.poa_sides
    .map(
      (s) =>
        `${s.side.replace(/_/g, " ")} — ~${s.stitch_count.toLocaleString()} stitches`
    )
    .join("; ")
  const productTitle =
    parsed.product_title ?? parsed.lines[0]?.product_title ?? "Custom design"
  const message = [
    `Auto-created from the Studio: embroidery design over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches (price on application).`,
    ``,
    `Product: ${productTitle}`,
    `Embroidery: ${sideSummary}`,
    `Total quantity: ${totalQuantity}`,
    ...(parsed.note?.trim() ? [``, `Customer note: ${parsed.note.trim()}`] : []),
  ].join("\n")

  const [quote] = await quoteService.createQuotes([
    {
      public_id: publicId,
      status: "new",
      source: "customizer_poa",
      email,
      customer_id: customerId,
      contact_name: contactName,
      contact_phone: contactPhone,
      subject: `Embroidery over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches — ${productTitle}`,
      message,
      line_items: { items: newLines },
      metadata: {
        poa_request: true,
        poa_sides: parsed.poa_sides,
      },
    },
  ])

  await quoteService.createQuoteEvents([
    {
      quote_id: quote.id,
      type: "created",
      actor: email,
      body: {
        source: "customizer_poa",
        public_id: publicId,
        group_id: parsed.group_id,
        line_count: newLines.length,
      },
    },
  ])

  const notificationRecipient = CONTACT_NOTIFICATION_EMAIL?.trim()
  if (notificationRecipient) {
    try {
      const notificationModuleService: INotificationModuleService =
        req.scope.resolve(Modules.NOTIFICATION)
      await notificationModuleService.createNotifications({
        to: notificationRecipient,
        channel: "email",
        template: EmailTemplates.CONTACT_SUBMISSION,
        data: {
          emailOptions: {
            subject: `New POA quote request ${publicId}: embroidery over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches`,
            replyTo: email,
          },
          submission: {
            id: quote.id,
            firstName: contactName,
            lastName: null,
            email,
            phone: contactPhone,
            subject: `Embroidery POA — ${productTitle}`,
            message,
            sourceOrigin: req.headers.origin ?? null,
            sourceIp: null,
            userAgent: req.headers["user-agent"] ?? null,
          },
          preview: `Quote ${publicId}`,
        },
      })
    } catch (err) {
      console.error("POA quote notification failed", err)
    }
  }

  getPostHog()?.capture({
    distinctId: email,
    event: "quote requested",
    properties: {
      quote_id: quote.id,
      public_id: publicId,
      source: "customizer_poa",
      customer_id: customerId,
      line_count: newLines.length,
      total_quantity: totalQuantity,
      max_stitch_count: Math.max(
        0,
        ...parsed.poa_sides.map((s) => s.stitch_count)
      ),
      $set: { email },
    },
  })

  return res.status(201).json({
    success: true,
    quote_id: quote.id,
    public_id: publicId,
    reply_to: SUPPORT_REPLY_TO_EMAIL ?? null,
  })
}

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../lib/audit-log"
import { CONTACT_NOTIFICATION_EMAIL, ORDER_INBOX_DOMAIN } from "../../../../../../../lib/constants"
import { quoteInboxAddress } from "../../../../../../../lib/order-inbox-alias"
import { getPostHog } from "../../../../../../../lib/posthog"
import { mapQuoteDesignLines } from "../../../../../../../lib/quote-design-lines"
import {
  buildReorderLineMetadata,
  isGeneratedLine,
  lineTitle,
  linePrintSizeId,
} from "../../../../../../../lib/reorder-lines"
import { requireCustomer } from "../../../../../../../lib/require-customer"
import { archiveLineDesigns } from "../../../../../../../lib/side-layouts-archive"
import { EmailTemplates } from "../../../../../../../modules/email-notifications/templates"
import { QUOTE_MODULE } from "../../../../../../../modules/quote"
import { adminJobUrl } from "../../../../../../../services/jobs/start-from-enquiry"
import { bustTodayCache } from "../../../../../../../services/jobs/today"
import { approvedDesignFor, loadOwnOrder } from "../../../../../../../services/reorder/load"

const bodySchema = z.object({
  line_ids: z.array(z.string().min(1).max(80)).max(300).optional(),
  note: z.string().max(2000).optional(),
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * POST /store/customers/me/orders/:id/reorder-request  { line_ids?, note? }
 *   → { quote_id, public_id }
 *
 * "Ask us to re-order": a `new` job (quote, source "reorder") copying the
 * chosen lines at their last price, approved proof artwork merged in, for
 * lines the cart can't take (no Studio design, embroidery panel, …). Staff
 * are emailed once. A second ask for the same order within 24 h, while
 * that job is still `new`, returns it (a note is added to it).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid request.")
  const note = parsed.data.note?.trim() || null
  const wanted = parsed.data.line_ids?.length ? new Set(parsed.data.line_ids) : null

  const order = await loadOwnOrder(req.scope, req.params.id, customerId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  const displayId = order.display_id ?? order.id

  const quotes = req.scope.resolve(QUOTE_MODULE) as any

  // ponytail: same newest-500 scan as startJobFromEnquiry (jsonb filters on the module aren't reliable).
  const recent: any[] = await quotes
    .listQuotes(
      { customer_id: customerId },
      { take: 500, order: { created_at: "DESC" }, select: ["id", "public_id", "status", "metadata", "created_at"] }
    )
    .catch(() => [])
  const existing = recent.find(
    (q) =>
      q?.status === "new" &&
      q?.metadata?.reorder_of_order_id === order.id &&
      Date.now() - new Date(q.created_at).getTime() < DAY_MS
  )
  if (existing?.id) {
    if (note) {
      await quotes
        .createQuoteEvents([{ quote_id: existing.id, type: "note", actor: "customer", body: { text: note, source: "reorder" } }])
        .catch(() => undefined)
    }
    return res.json({ quote_id: existing.id, public_id: existing.public_id })
  }

  const lines = order.items.filter((l) => (!wanted || wanted.has(l.id)) && !isGeneratedLine(l))
  if (wanted && lines.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "None of those lines are on this order.")
  }

  const items: any[] = []
  let usedApprovedArtwork = false
  for (const l of lines) {
    const hasDesign = !!l.metadata?.customizerDesign && typeof l.metadata.customizerDesign === "object"
    const groupId = String(l.metadata?.customizerDesign?.group_id || l.id)
    let metadata: Record<string, unknown> = { product_handle: l.metadata?.product_handle ?? l.product_handle ?? null }
    if (hasDesign) {
      const merged = await approvedDesignFor(order, l)
      if (merged.replacedSides.length) usedApprovedArtwork = true
      const built = buildReorderLineMetadata({
        line: l,
        design: merged.design,
        appliedProofs: merged.appliedProofs,
        groupId,
        groupSize: 1,
        order: { id: order.id, display_id: order.display_id },
      })
      metadata = {
        customizerDesign: built.customizerDesign,
        product_handle: built.product_handle ?? null,
        print_size_id: linePrintSizeId(l, merged.design),
      }
    }
    const [mapped] = mapQuoteDesignLines(
      [
        {
          kind: hasDesign ? "customizer" : "standard",
          variant_id: l.variant_id ?? null,
          product_id: l.product_id ?? "",
          product_title: (l.product_title || l.title || "Item").slice(0, 300),
          variant_title: l.variant_title ? l.variant_title.slice(0, 300) : null,
          quantity: Math.max(1, l.quantity ?? 1),
          unit_price_cents: Math.round((l.unit_price ?? 0) * 100),
          metadata,
        },
      ],
      groupId
    )
    items.push({ ...mapped, thumbnail: mapped.thumbnail ?? l.thumbnail ?? null })
  }

  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`
  await archiveLineDesigns(req.scope, items, `reorder-${publicId}`)

  let customer: any = null
  try {
    customer = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(customerId)
  } catch {
    /* fall back to the order's email */
  }
  const email = String(customer?.email || order.email || "").toLowerCase()
  const contactName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || null
  const total = items.reduce((s, i) => s + (i.total ?? 0), 0)
  const message = [
    `Re-order requested from order #${displayId}.`,
    ...lines.map((l) => `• ${l.quantity ?? 1} × ${lineTitle(l)}`),
    ...(usedApprovedArtwork ? ["", "Uses the artwork approved on the last proof."] : []),
    ...(note ? ["", `Customer note: ${note}`] : []),
  ].join("\n")

  const [quote] = await quotes.createQuotes([
    {
      public_id: publicId,
      status: "new",
      // Plain text column; "reorder" joins cart/contact/… (model enum is app-level).
      source: "reorder" as any,
      email,
      customer_id: customerId,
      contact_name: contactName,
      contact_phone: customer?.phone ?? null,
      company: customer?.company_name ?? null,
      subject: `Re-order of #${displayId}`,
      message,
      currency_code: order.currency_code ?? "aud",
      total_estimate: Math.round(total * 100) / 100,
      line_items: { items },
      metadata: {
        reorder_of_order_id: order.id,
        reorder_of_display_id: order.display_id,
        ...(note ? { customer_note: note } : {}),
      },
    },
  ])
  await quotes.createQuoteEvents([
    {
      quote_id: quote.id,
      type: "created",
      actor: "customer",
      body: { source: "reorder", order_id: order.id, public_id: publicId, line_count: items.length },
    },
  ])
  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.QUOTE,
    entity_id: quote.id,
    action: AUDIT_ACTION.CREATED,
    actor_id: customerId,
    actor_email: email || null,
    details: { source: "reorder", order_id: order.id, display_id: order.display_id },
  })
  bustTodayCache()

  const recipient = CONTACT_NOTIFICATION_EMAIL?.trim()
  if (recipient) {
    try {
      const notifications: INotificationModuleService = req.scope.resolve(Modules.NOTIFICATION)
      await notifications.createNotifications({
        to: recipient,
        channel: "email",
        template: EmailTemplates.CONTACT_SUBMISSION,
        data: {
          emailOptions: {
            subject: `Re-order requested: order #${displayId} (${publicId})`,
            replyTo: ORDER_INBOX_DOMAIN && email ? [email, quoteInboxAddress(quote.id)!] : email || undefined,
          },
          jobUrl: adminJobUrl(quote.id),
          carts: [],
          submission: {
            id: publicId,
            firstName: customer?.first_name ?? null,
            lastName: customer?.last_name ?? null,
            email,
            phone: customer?.phone ?? null,
            subject: `Re-order of #${displayId}`,
            message,
          },
          preview: `Re-order requested from order #${displayId}`,
        },
      })
    } catch (err) {
      console.error("Re-order request notification failed", err)
    }
  }

  getPostHog()?.capture({
    distinctId: customerId,
    event: "reorder requested",
    properties: { order_id: order.id, quote_id: quote.id, line_count: items.length, used_approved_artwork: usedApprovedArtwork },
  })

  return res.status(201).json({ quote_id: quote.id, public_id: publicId })
}

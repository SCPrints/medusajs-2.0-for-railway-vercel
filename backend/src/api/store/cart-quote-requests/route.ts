import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { CONTACT_NOTIFICATION_EMAIL } from "../../../lib/constants"
import { fillCustomerBlanks } from "../../../lib/customer-contact-backfill"
import { createQuoteFromCart, findOpenCarts } from "../../../lib/open-carts"
import { getPostHog } from "../../../lib/posthog"
import { EmailTemplates } from "../../../modules/email-notifications/templates"

/**
 * POST /store/cart-quote-requests  body: { cart_id, note?, contact_phone? }
 *   → 201 { success, public_id }
 *
 * The cart's "Email me a quote / proof" button: copies the cart into a `new`
 * quote (artwork intact) and alerts staff, for customers who want a proof or a
 * payment link instead of checking out. The cart id is the capability (same as
 * every other cart endpoint). Idempotent per cart, so repeat clicks can't
 * flood the inbox — staff are only emailed when the quote is first created.
 */
const schema = z.object({
  cart_id: z.string().startsWith("cart_").max(80),
  note: z.string().max(2000).optional(),
  contact_phone: z.string().max(40).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid request" })
  const { cart_id, note, contact_phone } = parsed.data

  let result: Awaited<ReturnType<typeof createQuoteFromCart>>
  try {
    result = await createQuoteFromCart(req.scope, cart_id, {
      source: "cart",
      actor: "customer",
      note,
      contactPhone: contact_phone,
    })
  } catch (err: any) {
    return res.status(err?.status ?? 500).json({ success: false, message: err?.message ?? "Could not request a quote" })
  }

  const [cart] = await findOpenCarts(req.scope, { q: cart_id, limit: 1 }).catch(() => [])
  if (cart?.email && contact_phone) await fillCustomerBlanks(req.scope, cart.email, { phone: contact_phone })

  const recipient = CONTACT_NOTIFICATION_EMAIL?.trim()
  if (result.created && recipient) {
    try {
      const notifications: INotificationModuleService = req.scope.resolve(Modules.NOTIFICATION)
      await notifications.createNotifications({
        to: recipient,
        channel: "email",
        template: EmailTemplates.CONTACT_SUBMISSION,
        data: {
          emailOptions: {
            subject: `[Has cart $${(cart?.item_total ?? 0).toFixed(2)}] Quote / proof requested from cart ${result.public_id}`,
            replyTo: cart?.email ?? undefined,
          },
          carts: cart ? [cart] : [],
          submission: {
            id: result.public_id,
            firstName: cart?.customer_name ?? null,
            lastName: null,
            email: cart?.email ?? "",
            phone: contact_phone ?? null,
            subject: "Email me a quote / proof (from cart)",
            message: note?.trim() || "Customer asked for a quote / proof instead of checking out. Quote created — open it in admin to send the proof and payment link.",
            sourceOrigin: req.headers.origin ?? null,
            sourceIp: null,
            userAgent: req.headers["user-agent"] ?? null,
          },
          preview: `Quote ${result.public_id} requested from cart`,
        },
      })
    } catch (err) {
      console.error("Cart quote-request notification failed", err)
    }
  }

  getPostHog()?.capture({
    distinctId: cart_id,
    event: "cart quote requested",
    properties: { cart_id, quote_id: result.quote_id, public_id: result.public_id, created: result.created },
  })

  return res.status(result.created ? 201 : 200).json({ success: true, public_id: result.public_id })
}

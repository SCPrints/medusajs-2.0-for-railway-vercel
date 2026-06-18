import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ulid } from "ulid"
import { z } from "zod"

import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { getPostHog } from "../../../../../lib/posthog"
import { verifyQuoteDesign } from "../../../../../services/quote-design/sign"

/**
 * POST /store/quotes/:id/design-items
 *   body: { qsig, group_id, lines: QuoteDesignLine[] }
 *   → 201 { ok, lines, count }
 *
 * Storefront-callable relay target for the quote "Design in Studio" flow.
 * The storefront customiser (quote mode) hits this via the Next.js
 * /api/quote-bridge relay when staff click the add-to-cart CTA inside the
 * Studio popup.
 *
 * Auth model: the `qsig` HMAC (see services/quote-design/sign.ts) is the
 * capability — a quote id is long-lived, so unlike POS we can't treat the id
 * itself as the secret. The admin mints the signed URL; this route verifies it.
 *
 * Multi-size designs arrive as several lines in ONE request sharing a
 * `group_id`. We replace every existing line carrying that group_id, then
 * append the new set — so re-editing a design in the Studio cleanly overwrites
 * it (and never races, unlike a per-line loop). Free-text and product-picker
 * lines have no group_id, so they're never touched.
 */
const schema = z.object({
  qsig: z.string().min(8).max(64),
  group_id: z.string().min(1).max(80),
  lines: z
    .array(
      z.object({
        line_id: z.string().max(80).optional(),
        kind: z.enum(["standard", "customizer"]).default("customizer"),
        variant_id: z.string().nullable(),
        product_id: z.string(),
        product_title: z.string().max(300),
        variant_title: z.string().max(300).nullable().optional(),
        quantity: z.number().int().min(1).max(100_000),
        unit_price_cents: z
          .number()
          .int()
          .min(0)
          .max(100_000_000)
          .nullable()
          .optional(),
        metadata: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .min(1)
    .max(100),
})

const TERMINAL_STATUSES = new Set([
  "accepted",
  "converting",
  "converted",
  "lost",
  "expired",
])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  if (!verifyQuoteDesign(id, body.qsig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }

  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (TERMINAL_STATUSES.has(String(quote.status))) {
    return res
      .status(409)
      .json({ error: "quote_not_editable", status: quote.status })
  }

  const newLines = body.lines.map((l) => {
    const md = (l.metadata ?? {}) as Record<string, any>
    const unit_price =
      typeof l.unit_price_cents === "number"
        ? Math.round(l.unit_price_cents) / 100
        : null
    const quantity = l.quantity
    const total =
      unit_price != null && quantity != null
        ? Math.round(unit_price * quantity * 100) / 100
        : null
    const title = `${l.product_title}${
      l.variant_title ? ` — ${l.variant_title}` : ""
    }`
    const design =
      md.customizerDesign && typeof md.customizerDesign === "object"
        ? md.customizerDesign
        : null
    // Prefer a rendered mockup as the admin thumbnail so the quote line shows
    // what the customer designed, not the blank garment.
    const thumbnail =
      (Array.isArray(design?.artifacts)
        ? design.artifacts.find((a: any) => a?.mockupUrl)?.mockupUrl
        : null) ?? null

    return {
      id: l.line_id || ulid(),
      title,
      description: null,
      quantity,
      unit_price,
      total,
      product_id: l.product_id,
      variant_id: l.variant_id,
      product_handle:
        typeof md.product_handle === "string" ? md.product_handle : null,
      thumbnail,
      customizerDesign: design,
      print_size_id:
        typeof md.print_size_id === "string" ? md.print_size_id : null,
      group_id: body.group_id,
      // NOTE: `kind` is intentionally NOT persisted — nothing reads it on a
      // quote, and the admin save round-trip (DraftLineItem) doesn't carry it,
      // so storing it here would make it vanish on the first edit. Keep the
      // persisted line shape consistent across both write paths.
    }
  })

  const existing = Array.isArray(quote.line_items?.items)
    ? (quote.line_items.items as Array<Record<string, any>>).filter(
        (li) => li?.group_id !== body.group_id
      )
    : []

  await service.updateQuotes([
    { id, line_items: { items: [...existing, ...newLines] } },
  ])

  await service.createQuoteEvents([
    {
      quote_id: id,
      type: "line_items_updated",
      actor: "studio",
      body: { group_id: body.group_id, count: newLines.length, design: true },
    },
  ])

  getPostHog()?.capture({
    distinctId: quote.email ?? id,
    event: "quote design attached",
    properties: {
      quote_id: id,
      public_id: quote.public_id,
      group_id: body.group_id,
      line_count: newLines.length,
    },
  })

  return res.status(201).json({ ok: true, lines: newLines, count: newLines.length })
}

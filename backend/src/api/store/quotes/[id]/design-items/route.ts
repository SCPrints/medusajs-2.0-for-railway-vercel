import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { QUOTE_MODULE } from "../../../../../modules/quote"
import type QuoteModuleService from "../../../../../modules/quote/service"
import { getPostHog } from "../../../../../lib/posthog"
import {
  mapQuoteDesignLines,
  quoteDesignLineSchema,
} from "../../../../../lib/quote-design-lines"
import {
  archiveLineDesigns,
  archiveSideLayoutsIfLarge,
  restoreSideLayouts,
} from "../../../../../lib/side-layouts-archive"
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
  // The shared CustomizerMetadata for the whole group, sent ONCE. The design
  // is identical across size lines (only variantId differs), and duplicating
  // it per line blew past the bridge/body caps (413) for heavy vector artwork.
  // Older payloads instead carry metadata.customizerDesign per line — both
  // shapes are accepted.
  design: z.record(z.string(), z.unknown()).nullable().optional(),
  lines: z.array(quoteDesignLineSchema).min(1).max(100),
})

const TERMINAL_STATUSES = new Set([
  "accepted",
  "converting",
  "converted",
  "lost",
  "expired",
])

/**
 * GET /store/quotes/:id/design-items?qsig=<sig>&group=<groupId>
 *   → { customizerDesign }
 *
 * Returns the saved CustomizerMetadata for a quote design group so the Studio
 * can REHYDRATE it on "Edit design in Studio" (colour + artwork per side). Same
 * `qsig` capability as the POST. Null when the group has no design line yet.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const qsig = typeof req.query.qsig === "string" ? req.query.qsig : ""
  const group = typeof req.query.group === "string" ? req.query.group : ""
  if (!verifyQuoteDesign(id, qsig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }
  if (!group) return res.status(400).json({ error: "group required" })

  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  const items = Array.isArray(quote.line_items?.items)
    ? (quote.line_items.items as Array<Record<string, any>>)
    : []
  const line = items.find(
    (li) => li?.group_id === group && li?.customizerDesign
  )
  // Re-inline archived sideLayouts so the Studio re-edit gets a full canvas.
  const design = line?.customizerDesign
    ? await restoreSideLayouts(line.customizerDesign)
    : null
  res.json({ customizerDesign: design })
}

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

  // Archive heavy sideLayouts to R2 BEFORE fanning out, so every size line
  // shares one archived URL instead of N inline multi-MB copies (the 19MB
  // quote-row / backend-OOM failure mode).
  const sharedDesign = body.design
    ? await archiveSideLayoutsIfLarge(req.scope, body.design, `quote-${id}`)
    : null

  // Fan the shared design back out onto each line (accept-route + admin +
  // print files all read customizerDesign per line), stamping the line's own
  // variantId. Per-line customizerDesign in metadata (legacy shape) wins if
  // present.
  const lines = sharedDesign
    ? body.lines.map((l) =>
        l.metadata?.customizerDesign
          ? l
          : {
              ...l,
              metadata: {
                ...l.metadata,
                customizerDesign: {
                  ...sharedDesign,
                  ...(l.variant_id ? { variantId: l.variant_id } : {}),
                },
              },
            }
      )
    : body.lines

  // Shared with /store/quotes/poa-request — keep the persisted line shape
  // identical across both write paths (see lib/quote-design-lines.ts).
  const newLines = mapQuoteDesignLines(lines, body.group_id)
  // Legacy per-line designs bypass the shared-design archive above.
  await archiveLineDesigns(req.scope, newLines, `quote-${id}`)

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

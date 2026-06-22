import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { QUOTE_MODULE } from "../../../modules/quote"
import type QuoteModuleService from "../../../modules/quote/service"
import { getPostHog } from "../../../lib/posthog"
import { writeAudit } from "../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../lib/audit-entities"
import { verifyQuoteApproval } from "../../../services/quote-approval/sign"

const SIDE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  printed_tag: "Printed tag",
  bottle_label: "Label",
  bottle_back_label: "Back label",
}

type DesignApprovalStatus = "pending" | "approved" | "changes_requested"

const postSchema = z.object({
  quote: z.string().min(1),
  sig: z.string().min(16).max(64),
  approved: z.boolean(),
  approver_name: z.string().max(200).optional(),
  comment: z.string().max(2000).optional(),
})

/**
 * GET  /store/quote-design-approval?quote=<id>&sig=<sig>
 *   → { quote_id, public_id, design_approval_status, mockup_urls, … }
 *
 * POST /store/quote-design-approval
 *   body: { quote, sig, approved, approver_name?, comment? }
 *   → { ok, status }
 *
 * Customer-facing design sign-off for a quote — mirrors the order
 * artwork-approval flow. The GET feeds the storefront /quote-approval/[id]
 * page (the mockups the staffer designed in the Studio); POST records the
 * customer's Approve / Request-changes decision onto the quote, appends a
 * QuoteEvent + audit row, and emits a PostHog event. This is sign-off on the
 * DESIGN — distinct from accepting the quote price (quote-accept).
 */

function buildMockups(quote: any): Array<{
  side: string
  side_label: string | null
  url: string
}> {
  const lines = Array.isArray(quote?.line_items?.items)
    ? (quote.line_items.items as Array<Record<string, any>>)
    : []
  const seen = new Set<string>()
  const out: Array<{ side: string; side_label: string | null; url: string }> = []
  for (const li of lines) {
    const artifacts = Array.isArray(li?.customizerDesign?.artifacts)
      ? li.customizerDesign.artifacts
      : []
    for (const a of artifacts) {
      const url = a?.mockupUrl
      if (typeof url !== "string" || !url || seen.has(url)) continue
      seen.add(url)
      const side = typeof a?.side === "string" ? a.side : "front"
      const garment = typeof li?.title === "string" ? li.title : null
      const sideLabel = SIDE_LABELS[side] ?? null
      // Label = garment title (+ side when not the front) so the customer can
      // tell which mockup is which on a multi-line quote.
      const label =
        garment && sideLabel && side !== "front"
          ? `${garment} — ${sideLabel}`
          : garment ?? sideLabel
      out.push({ side, side_label: label, url })
    }
  }
  return out
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const quoteId = String((req.query?.quote as string) ?? "")
  const sig = String((req.query?.sig as string) ?? "")
  if (!verifyQuoteApproval(quoteId, sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }
  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(quoteId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  const meta = (quote.metadata ?? {}) as Record<string, unknown>
  const status =
    (typeof meta.design_approval_status === "string"
      ? (meta.design_approval_status as DesignApprovalStatus)
      : "pending") ?? "pending"

  res.json({
    quote_id: quote.id,
    public_id: typeof quote.public_id === "string" ? quote.public_id : null,
    company: typeof quote.company === "string" ? quote.company : null,
    design_approval_status: status,
    design_approved_at:
      typeof meta.design_approved_at === "string"
        ? meta.design_approved_at
        : null,
    design_approver_name:
      typeof meta.design_approver_name === "string"
        ? meta.design_approver_name
        : null,
    design_changes_comment:
      typeof meta.design_changes_comment === "string"
        ? meta.design_changes_comment
        : null,
    mockup_urls: buildMockups(quote),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  if (!verifyQuoteApproval(body.quote, body.sig)) {
    return res.status(400).json({ error: "invalid_signature" })
  }

  const service = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  let quote: any
  try {
    quote = await service.retrieveQuote(body.quote)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }

  const meta = (quote.metadata ?? {}) as Record<string, unknown>
  const now = new Date().toISOString()
  const nextStatus: DesignApprovalStatus = body.approved
    ? "approved"
    : "changes_requested"

  // Read-modify-write: a bare { metadata: { oneKey } } REPLACES the whole jsonb
  // column, wiping every other key. Always spread the existing metadata.
  const updates: Record<string, unknown> = {
    ...meta,
    design_approval_status: nextStatus,
    design_approval_changed_at: now,
  }
  if (body.approved) {
    if (typeof meta.design_approved_at !== "string") {
      updates.design_approved_at = now
    }
    if (body.approver_name) updates.design_approver_name = body.approver_name
    if (body.comment) updates.design_approver_comment = body.comment
    delete updates.design_changes_comment
  } else {
    updates.design_changes_requested_at = now
    if (body.comment) updates.design_changes_comment = body.comment
  }

  await service.updateQuotes([{ id: body.quote, metadata: updates }])

  try {
    await service.createQuoteEvents([
      {
        quote_id: body.quote,
        type: "status_changed",
        actor: body.approver_name || "customer",
        body: {
          design_approval: nextStatus,
          comment: body.comment ?? null,
        },
      },
    ])
  } catch {
    /* event log is best-effort */
  }

  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.QUOTE,
    entity_id: body.quote,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_email: body.approver_name ?? "customer",
    details: { design_approval: nextStatus, has_comment: !!body.comment },
  })

  getPostHog()?.capture({
    distinctId: quote.email ?? body.quote,
    event: body.approved
      ? "quote design approved"
      : "quote design changes requested",
    properties: {
      quote_id: body.quote,
      public_id: quote.public_id ?? null,
      approver_name: body.approver_name ?? null,
      has_comment: !!body.comment,
    },
  })

  res.json({ ok: true, status: nextStatus })
}

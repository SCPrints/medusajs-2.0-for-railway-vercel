import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ulid } from "ulid"
import { z } from "zod"

import { isValidEmail } from "../../../lib/email-validation"
import { getPostHog } from "../../../lib/posthog"
import { slimQuoteForAdmin } from "../../../lib/quote-admin-slim"
import { QUOTE_MODULE } from "../../../modules/quote"
import type QuoteModuleService from "../../../modules/quote/service"

const createSchema = z.object({
  email: z.string().min(3),
  contact_name: z.string().max(120).optional(),
  contact_phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  subject: z.string().max(200).optional(),
  message: z.string().max(8000).optional(),
  assigned_to: z.string().max(120).optional(),
  currency_code: z.string().max(8).optional(),
  total_estimate: z.coerce.number().nonnegative().optional(),
  line_items: z
    .array(
      z.object({
        id: z.string().max(80).optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(500).nullable().optional(),
        quantity: z.coerce.number().int().min(0).nullable().optional(),
        unit_price: z.coerce.number().nullable().optional(),
        total: z.coerce.number().nullable().optional(),
        // Catalog linkage + Studio design payload (carried verbatim).
        product_id: z.string().max(80).nullable().optional(),
        variant_id: z.string().max(80).nullable().optional(),
        product_handle: z.string().max(200).nullable().optional(),
        thumbnail: z.string().max(2000).nullable().optional(),
        customizerDesign: z.any().nullable().optional(),
        print_size_id: z.string().max(40).nullable().optional(),
        group_id: z.string().max(80).nullable().optional(),
      })
    )
    .max(50)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * GET /admin/quotes?status=new,quoted&assigned_to=...&q=...
 *   → { quotes, count }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = (req.query.status as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean)
  const assignedTo = (req.query.assigned_to as string | undefined)?.trim()
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.max(1, Math.min(200, Number.parseInt((req.query.limit as string) ?? "50", 10) || 50))
  const offset = Math.max(0, Number.parseInt((req.query.offset as string) ?? "0", 10) || 0)

  const filters: Record<string, unknown> = {}
  if (status?.length) filters.status = status
  if (assignedTo) filters.assigned_to = assignedTo

  const quoteService = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)

  let quotes: any[]
  let count: number
  if (q) {
    const [all, total] = await quoteService.listAndCountQuotes(filters, {
      take: 500,
      skip: 0,
      order: { created_at: "DESC" },
    })
    const term = q.toLowerCase()
    const matched = (all as any[]).filter((quote) => {
      const haystack = [
        quote.email,
        quote.public_id,
        quote.subject,
        quote.company,
        quote.contact_name,
      ]
        .filter((v): v is string => typeof v === "string")
        .join(" ")
        .toLowerCase()
      return haystack.includes(term)
    })
    quotes = matched.slice(offset, offset + limit)
    count = matched.length
  } else {
    const [list, total] = await quoteService.listAndCountQuotes(filters, {
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    })
    quotes = list as any[]
    count = total as number
  }

  return res.json({
    quotes: quotes.map((q) => slimQuoteForAdmin(q)),
    count,
    limit,
    offset,
  })
}

/**
 * POST /admin/quotes
 *   Create a quote on a customer's behalf (source = "admin"). Lands in the
 *   pipeline as `new`. Mirrors the storefront create path (public_id +
 *   "created" event + PostHog), but is staff-authored so it can carry an
 *   estimate, assignee, and priced line items from the outset.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ message: err?.message ?? "Invalid request" })
  }

  const email = parsed.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." })
  }

  const quoteService = req.scope.resolve<QuoteModuleService>(QUOTE_MODULE)
  const actor = (req as any).auth_context?.actor_id ?? null
  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`

  const lineItems = (parsed.line_items ?? []).map((li) => {
    const quantity = li.quantity ?? null
    const unit_price = li.unit_price ?? null
    const total =
      li.total ??
      (quantity != null && unit_price != null
        ? Math.round(quantity * unit_price * 100) / 100
        : null)
    return {
      id: li.id || ulid(),
      title: li.title,
      description: li.description ?? null,
      quantity,
      unit_price,
      total,
      product_id: li.product_id ?? null,
      variant_id: li.variant_id ?? null,
      product_handle: li.product_handle ?? null,
      thumbnail: li.thumbnail ?? null,
      customizerDesign: li.customizerDesign ?? null,
      print_size_id: li.print_size_id ?? null,
      group_id: li.group_id ?? null,
    }
  })

  const [quote] = await quoteService.createQuotes([
    {
      public_id: publicId,
      status: "new",
      source: "admin",
      email,
      contact_name: parsed.contact_name ?? null,
      contact_phone: parsed.contact_phone ?? null,
      company: parsed.company ?? null,
      subject: parsed.subject ?? null,
      message: parsed.message ?? null,
      assigned_to: parsed.assigned_to ?? null,
      currency_code: parsed.currency_code ?? "aud",
      total_estimate: parsed.total_estimate ?? null,
      line_items: { items: lineItems },
      metadata: parsed.metadata ?? {},
    },
  ])

  await quoteService.createQuoteEvents([
    {
      quote_id: quote.id,
      type: "created",
      actor,
      body: { source: "admin", public_id: publicId, line_count: lineItems.length },
    },
  ])

  getPostHog()?.capture({
    distinctId: actor ?? email,
    event: "quote requested",
    properties: {
      quote_id: quote.id,
      public_id: publicId,
      source: "admin",
      line_count: lineItems.length,
      $set: { email },
    },
  })

  return res.status(201).json({ quote: slimQuoteForAdmin(quote) })
}

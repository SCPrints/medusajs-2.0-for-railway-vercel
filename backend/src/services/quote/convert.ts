import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  convertDraftOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"

import { QUOTE_MODULE } from "../../modules/quote"
import type QuoteModuleService from "../../modules/quote/service"
import { buildStudioAddress } from "../pos-checkout/checkout"
import { writeAudit } from "../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { captureEvent } from "../../lib/posthog"

export type ConvertQuoteResult = {
  order_id: string
  display_id: number | string | null
  lines_added: number
  skipped_items: Array<Record<string, unknown>>
  idempotent?: boolean
}

/**
 * Staff-side quote → order conversion — no customer checkout involved.
 *
 * Marries the two existing halves:
 *  - line mapping from the customer accept route (quoted unit_price honoured,
 *    customizerDesign carried, quote_locked_price stamped)
 *  - order creation from the POS checkout recipe:
 *    createOrderWorkflow(is_draft_order) → convertDraftOrderWorkflow
 *
 * The order lands UNPAID on purpose: the order-placed subscriber emails the
 * customer the tax invoice, which (Phase 1) shows the balance due, the due
 * date, and bank-transfer details. EFT lands → staff click "Record payment
 * received" on the order. That's the on-account billing loop.
 *
 * Due date: if the quote's customer carries `metadata.payment_terms_days`,
 * `metadata.balance_due_at` is stamped now + terms so the invoice prints
 * "Due by …" automatically.
 *
 * Idempotent — a quote with `metadata.order_id` already set returns that
 * order untouched.
 */
export const convertQuoteToOrder = async (
  container: MedusaContainer,
  args: { quoteId: string; actorId: string | null }
): Promise<ConvertQuoteResult> => {
  const service = container.resolve<QuoteModuleService>(QUOTE_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const quote: any = await service.retrieveQuote(args.quoteId)

  const meta = ((quote.metadata as Record<string, unknown>) ?? {})
  if (typeof meta.order_id === "string" && meta.order_id) {
    return {
      order_id: meta.order_id,
      display_id: (meta.order_display_id as number | string) ?? null,
      lines_added: 0,
      skipped_items: [],
      idempotent: true,
    }
  }
  if (quote.status === "lost" || quote.status === "expired") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Quote is ${quote.status} — reopen it before converting.`
    )
  }

  // ── Region + sales channel (same resolution as the accept route) ────────
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    pagination: { take: 50, skip: 0 },
  })
  const region = (regions as any[])?.find(
    (r) =>
      String(r.currency_code).toLowerCase() ===
      String(quote.currency_code ?? "aud").toLowerCase()
  )
  if (!region?.id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `No region matches the quote currency "${quote.currency_code}".`
    )
  }
  let salesChannelId: string | undefined
  try {
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "is_disabled"],
      pagination: { take: 20, skip: 0 },
    })
    salesChannelId =
      ((channels as any[])?.find((c) => c.is_disabled !== true) ??
        (channels as any[])?.[0])?.id ?? undefined
  } catch {
    /* optional */
  }

  // ── Line mapping (accept-route logic) ────────────────────────────────────
  const lineItems: Array<Record<string, any>> =
    (quote.line_items as { items?: Array<Record<string, any>> })?.items ?? []

  // Resolve "whole product" lines (product_id, no variant_id) to the default
  // variant so they convert instead of being skipped.
  const productOnly = lineItems.filter(
    (li) =>
      !li?.variant_id &&
      typeof li?.product_id === "string" &&
      Number(li?.quantity ?? 0) > 0
  )
  if (productOnly.length) {
    try {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "variants.id", "variants.variant_rank"],
        filters: {
          id: [...new Set(productOnly.map((li) => String(li.product_id)))],
        },
      })
      const defaultVariant = new Map<string, string>()
      for (const p of products as any[]) {
        const sorted = [...(p?.variants ?? [])].sort(
          (a: any, b: any) => (a?.variant_rank ?? 0) - (b?.variant_rank ?? 0)
        )
        if (sorted[0]?.id) defaultVariant.set(String(p.id), String(sorted[0].id))
      }
      for (const li of productOnly) {
        const vid = defaultVariant.get(String(li.product_id))
        if (vid) li.variant_id = vid
      }
    } catch {
      /* leave unresolved → skipped below */
    }
  }

  const addable = lineItems.filter(
    (li) => typeof li?.variant_id === "string" && Number(li?.quantity ?? 0) > 0
  )
  // Custom fee lines (screen setup, artwork redraw, colour change…) have no
  // variant but a title + priced quantity. A draft order accepts variant-less
  // lines (the POS manual-discount line is exactly this shape), so carry them
  // onto the order instead of silently dropping billable amounts. The
  // customer accept-link path can't do this (carts require variants) — that
  // remains a documented limitation of the checkout flow.
  const customAddable = lineItems.filter(
    (li) =>
      !addable.includes(li) &&
      typeof li?.title === "string" &&
      li.title.trim() &&
      Number(li?.quantity ?? 0) > 0 &&
      li?.unit_price != null &&
      Number.isFinite(Number(li.unit_price))
  )
  const skipped = lineItems.filter(
    (li) => !addable.includes(li) && !customAddable.includes(li)
  )
  if (addable.length === 0 && customAddable.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Quote has no convertible line items — every line needs a product/variant or a title + price."
    )
  }

  const itemPayloads = addable.map((li) => {
    // Honour an explicit quoted price (incl. a deliberate 0); NULL/blank means
    // "not set" → omit so the line prices at catalog rate, never $0.
    const unitPrice = li.unit_price == null ? NaN : Number(li.unit_price)
    const lineMetadata: Record<string, unknown> = { quote_locked_price: true }
    if (li.customizerDesign && typeof li.customizerDesign === "object") {
      lineMetadata.customizerDesign = li.customizerDesign
      if (li.product_handle) lineMetadata.product_handle = li.product_handle
      if (li.print_size_id) lineMetadata.print_size_id = li.print_size_id
    }
    return {
      title: String(li.title ?? "Quoted item"),
      variant_id: String(li.variant_id),
      quantity: Number(li.quantity ?? 1),
      ...(Number.isFinite(unitPrice) && unitPrice >= 0
        ? { unit_price: unitPrice }
        : {}),
      metadata: lineMetadata,
    }
  })

  const customItemPayloads = customAddable.map((li) => ({
    title: String(li.title),
    quantity: Number(li.quantity ?? 1),
    unit_price: Number(li.unit_price),
    metadata: {
      quote_locked_price: true,
      quote_custom_line: true,
      ...(li.description ? { description: String(li.description) } : {}),
    },
  }))
  itemPayloads.push(...(customItemPayloads as any[]))

  // ── Payer: addresses + payment terms ─────────────────────────────────────
  // Geo fields default to the studio address so the tax engine computes AU
  // GST (POS pattern); the customer's own default address wins when present.
  // The quote's contact name/company overlay the billing identity so the
  // invoice "Bill to" shows the right entity either way.
  let billing: Record<string, unknown> = buildStudioAddress()
  let shipping: Record<string, unknown> = billing
  let termsDays: number | null = null
  if (quote.customer_id) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        filters: { id: quote.customer_id },
        fields: [
          "id",
          "metadata",
          "addresses.first_name",
          "addresses.last_name",
          "addresses.company",
          "addresses.address_1",
          "addresses.address_2",
          "addresses.city",
          "addresses.province",
          "addresses.postal_code",
          "addresses.country_code",
          "addresses.phone",
          "addresses.is_default_billing",
          "addresses.is_default_shipping",
        ],
      })
      const customer = (customers as any[])?.[0]
      const addresses = (customer?.addresses ?? []) as any[]
      const pick = (flag: string) =>
        addresses.find((a) => a?.[flag]) ?? addresses[0] ?? null
      const toAddr = (a: any) =>
        a
          ? {
              first_name: a.first_name ?? undefined,
              last_name: a.last_name ?? undefined,
              company: a.company ?? undefined,
              address_1: a.address_1 ?? "",
              address_2: a.address_2 ?? undefined,
              city: a.city ?? "",
              province: a.province ?? "",
              postal_code: a.postal_code ?? "",
              country_code: String(a.country_code ?? "au").toLowerCase(),
              phone: a.phone ?? undefined,
            }
          : null
      billing = toAddr(pick("is_default_billing")) ?? billing
      shipping = toAddr(pick("is_default_shipping")) ?? billing
      const t = (customer?.metadata as Record<string, unknown>)
        ?.payment_terms_days
      const n = typeof t === "string" ? Number.parseInt(t, 10) : Number(t)
      if (Number.isFinite(n) && n > 0) termsDays = n
    } catch {
      /* studio fallback stands */
    }
  }
  const contactName = String(quote.contact_name ?? "").trim()
  if (contactName || quote.company) {
    const [first, ...rest] = contactName.split(/\s+/).filter(Boolean)
    billing = {
      ...billing,
      ...(first ? { first_name: first, last_name: rest.join(" ") || "" } : {}),
      ...(quote.company ? { company: quote.company } : {}),
    }
  }

  const balanceDueAt = termsDays
    ? new Date(Date.now() + termsDays * 86_400_000).toISOString()
    : null

  // ── Create draft → convert (POS recipe) ──────────────────────────────────
  const draftResult = await createOrderWorkflow(container).run({
    input: {
      region_id: region.id,
      sales_channel_id: salesChannelId,
      currency_code: String(quote.currency_code ?? "aud").toLowerCase(),
      customer_id: quote.customer_id ?? undefined,
      email: quote.email,
      billing_address: billing,
      shipping_address: shipping,
      status: OrderStatus.DRAFT,
      is_draft_order: true,
      no_notification: true,
      metadata: {
        source: "quote_convert",
        quote_id: quote.id,
        quote_public_id: quote.public_id,
        converted_by: args.actorId,
        ...(balanceDueAt ? { balance_due_at: balanceDueAt } : {}),
      },
      items: itemPayloads,
    } as any,
  })
  const orderId = (draftResult as any)?.result?.id
  if (!orderId) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Draft order creation returned no id."
    )
  }
  await convertDraftOrderWorkflow(container).run({ input: { id: orderId } })

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ["id", "display_id"],
  })
  const displayId = (orders as any[])?.[0]?.display_id ?? null

  // ── Stamp the quote (direct — no cart, so the Phase 11 correlation
  // subscriber won't fire for this path) ───────────────────────────────────
  await service.updateQuotes([
    {
      id: quote.id,
      status: "accepted",
      accepted_at: quote.accepted_at ?? new Date(),
      metadata: {
        ...meta,
        order_id: orderId,
        order_display_id: displayId,
        converted_by: args.actorId,
        converted_via: "admin",
      },
    },
  ])
  await service.createQuoteEvents([
    {
      quote_id: quote.id,
      type: "status_changed",
      actor: args.actorId ?? "admin",
      body: {
        from: quote.status,
        to: "accepted",
        order_id: orderId,
        via: "admin_convert",
      },
    },
  ])

  await writeAudit({
    container: container as any,
    entity: AUDIT_ENTITY.QUOTE,
    entity_id: quote.id,
    action: AUDIT_ACTION.CONVERTED,
    actor_id: args.actorId,
    details: { order_id: orderId, display_id: displayId, lines: itemPayloads.length },
  })
  try {
    captureEvent(args.actorId ?? "system", "quote_converted_to_order", {
      quote_id: quote.id,
      order_id: orderId,
      lines_added: itemPayloads.length,
      lines_skipped: skipped.length,
      has_terms: !!balanceDueAt,
    })
  } catch {
    /* best-effort */
  }

  return {
    order_id: orderId,
    display_id: displayId,
    lines_added: itemPayloads.length,
    skipped_items: skipped,
  }
}

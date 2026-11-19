import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { customerQuoteSummary, ownsQuote, type CustomerQuoteSummary } from "../../lib/customer-quotes"
import { QUOTE_MODULE } from "../../modules/quote"
import type QuoteModuleService from "../../modules/quote/service"
import { STRIPE_PAYMENT_LINK_MODULE } from "../../modules/stripe-payment-link"

const LIST_LIMIT = 100

export async function customerEmailOf(container: any, customerId: string): Promise<string | null> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const row = await knex("customer").where("id", customerId).whereNull("deleted_at").first("email")
  return typeof row?.email === "string" && row.email.trim() ? row.email.trim().toLowerCase() : null
}

export type CustomerQuoteListRow = CustomerQuoteSummary & {
  order: { id: string; display_id: string | null } | null
}

/**
 * The customer's quotes, newest first. Raw SQL on purpose: quote lines carry
 * the Studio design (large), so only the few fields the list shows are pulled
 * out of the jsonb.
 */
export async function listCustomerQuotes(container: any, customerId: string): Promise<CustomerQuoteListRow[]> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const email = await customerEmailOf(container, customerId)
  const rows: any[] = await knex("quote as q")
    .whereNull("q.deleted_at")
    .andWhere((w: any) => {
      w.where("q.customer_id", customerId)
      if (email) w.orWhereRaw("lower(q.email) = ?", [email])
    })
    .orderBy("q.created_at", "desc")
    .limit(LIST_LIMIT)
    .select(
      "q.id",
      "q.public_id",
      "q.status",
      "q.subject",
      "q.currency_code",
      "q.total_estimate",
      "q.created_at",
      "q.quoted_at",
      "q.expires_at",
      knex.raw("q.metadata->>'order_id' as order_id"),
      knex.raw("q.metadata->>'order_display_id' as order_display_id"),
      // Only the two keys the status needs — never the whole metadata (pricer costs live there).
      knex.raw("jsonb_build_object('cart_pdf', q.metadata->'cart_pdf', 'staff_notified', q.metadata->'staff_notified') as metadata"),
      knex.raw(
        `(select coalesce(jsonb_agg(jsonb_build_object(
            'title', li->'title', 'description', li->'description', 'quantity', li->'quantity',
            'unit_price', li->'unit_price', 'total', li->'total', 'thumbnail', li->'thumbnail',
            'group_id', li->'group_id') order by ord), '[]'::jsonb)
          from jsonb_array_elements(
            case when jsonb_typeof(q.line_items->'items') = 'array' then q.line_items->'items' else '[]'::jsonb end
          ) with ordinality as t(li, ord)) as items`
      )
    )
  return rows.map((r) => ({
    ...customerQuoteSummary(r, r.items),
    order: r.order_id ? { id: r.order_id, display_id: r.order_display_id ?? null } : null,
  }))
}

/** The full quote row when it is this customer's, else null (callers answer 404). */
export async function retrieveOwnedQuote(container: any, customerId: string, quoteId: string): Promise<any | null> {
  const service = container.resolve(QUOTE_MODULE) as QuoteModuleService
  let quote: any
  try {
    quote = await service.retrieveQuote(quoteId)
  } catch {
    return null
  }
  return ownsQuote(quote, customerId, await customerEmailOf(container, customerId)) ? quote : null
}

/** For an accepted quote: its order (and whether it sits in this customer's account) + any unpaid card link. */
export async function quoteOrderInfo(
  container: any,
  customerId: string,
  quote: any
): Promise<{ order: { id: string; display_id: string | null; in_account: boolean } | null; pay_url: string | null }> {
  const meta = (quote?.metadata ?? {}) as Record<string, unknown>
  const orderId = typeof meta.order_id === "string" && meta.order_id ? meta.order_id : null
  if (!orderId) return { order: null, pay_url: null }
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const row = await knex("order").where("id", orderId).whereNull("deleted_at").first("display_id", "customer_id")
  let payUrl: string | null = null
  try {
    const links: any = container.resolve(STRIPE_PAYMENT_LINK_MODULE)
    const [open] = await links.listStripePaymentLinks(
      { order_id: orderId, status: "open" },
      { order: { created_at: "DESC" }, take: 1 }
    )
    payUrl = open?.url ?? null
  } catch {
    /* payment links are optional */
  }
  return {
    order: {
      id: orderId,
      display_id: row?.display_id != null ? String(row.display_id) : meta.order_display_id != null ? String(meta.order_display_id) : null,
      in_account: row?.customer_id === customerId,
    },
    pay_url: payUrl,
  }
}

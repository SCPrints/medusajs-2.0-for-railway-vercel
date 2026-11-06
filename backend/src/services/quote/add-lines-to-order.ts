import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditAddNewItemWorkflow,
  requestOrderEditRequestWorkflow,
} from "@medusajs/medusa/core-flows"

import { QUOTE_MODULE } from "../../modules/quote"
import type QuoteModuleService from "../../modules/quote/service"
import { writeAudit } from "../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { quoteLinesMissingFromOrder } from "../../lib/quote-order-lines"
import { quoteLineNeedsSizes } from "../../lib/sizes-pending"
import { customLinePayload, variantLinePayload } from "./convert"

/**
 * Quote lines staff added after the quote became an order (shipping, a late
 * fee, another garment) never reached the order: conversion runs once. This
 * puts them on the order with one Medusa order edit, at the quoted price, the
 * same shape conversion gives them, so the invoice and the amount owing
 * follow.
 */

export type MissingLine = { id: string; title: string; quantity: number; unit_price: number | null }

async function load(container: MedusaContainer, quoteId: string) {
  const quote: any = await container.resolve<QuoteModuleService>(QUOTE_MODULE).retrieveQuote(quoteId)
  const orderId = quote?.metadata?.order_id
  if (typeof orderId !== "string" || !orderId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This quote hasn't become an order yet.")
  }
  const order = await (container.resolve(Modules.ORDER) as any).retrieveOrder(orderId, { relations: ["items"] })
  const lines: Array<Record<string, any>> = quote.line_items?.items ?? []
  const missing = quoteLinesMissingFromOrder(lines, order.items ?? [])
    // A garment line needs a price to land on the order (a SKU line without one would take catalog price; keep that to conversion).
    .filter((li) => li.id && (li.unit_price != null || (li.variant_id && !quoteLineNeedsSizes(li))))
  return { quote, order, missing }
}

export async function quoteLinesNotOnOrder(container: MedusaContainer, quoteId: string) {
  const { order, missing } = await load(container, quoteId)
  return {
    order_id: order.id as string,
    display_id: (order.display_id as number | null) ?? null,
    lines: missing.map(
      (li): MissingLine => ({
        id: String(li.id),
        title: String(li.title),
        quantity: Number(li.quantity),
        unit_price: li.unit_price == null ? null : Number(li.unit_price),
      })
    ),
  }
}

export async function addQuoteLinesToOrder(
  container: MedusaContainer,
  input: { quoteId: string; lineIds: string[]; actorId?: string | null }
): Promise<{ order_id: string; added: number }> {
  const { quote, order, missing } = await load(container, input.quoteId)
  const wanted = new Set(input.lineIds)
  const lines = missing.filter((li) => wanted.has(String(li.id)))
  if (!lines.length) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Those lines are already on the order.")

  const items = lines.map((li) =>
    li.variant_id && !quoteLineNeedsSizes(li) ? variantLinePayload(li) : customLinePayload(li, quoteLineNeedsSizes(li))
  )

  await beginOrderEditOrderWorkflow(container).run({ input: { order_id: order.id, created_by: input.actorId ?? undefined } })
  try {
    await orderEditAddNewItemWorkflow(container).run({ input: { order_id: order.id, items: items as any } })
    await requestOrderEditRequestWorkflow(container).run({ input: { order_id: order.id, requested_by: input.actorId ?? undefined } })
    await confirmOrderEditRequestWorkflow(container).run({ input: { order_id: order.id, confirmed_by: input.actorId ?? undefined } })
  } catch (err) {
    try {
      await cancelBeginOrderEditWorkflow(container).run({ input: { order_id: order.id } })
    } catch {
      /* already confirmed or nothing to cancel */
    }
    throw err
  }

  const details = { order_id: order.id, quote_id: quote.id, lines: lines.map((li) => ({ id: li.id, title: li.title, quantity: li.quantity, unit_price: li.unit_price })) }
  for (const [entity, entity_id] of [[AUDIT_ENTITY.ORDER, order.id], [AUDIT_ENTITY.QUOTE, quote.id]] as const) {
    await writeAudit({ container, entity, entity_id, action: AUDIT_ACTION.QUOTE_LINES_ADDED_TO_ORDER, actor_id: input.actorId ?? undefined, details })
  }
  return { order_id: order.id, added: lines.length }
}

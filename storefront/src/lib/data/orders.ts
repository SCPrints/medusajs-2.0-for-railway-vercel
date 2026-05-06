"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { getAuthHeaders } from "./cookies"

const ORDER_FIELDS =
  "*payment_collections.payments,*fulfillments,+fulfillments.metadata,+fulfillments.labels,*shipping_methods,+shipping_methods.detail"

// No-op: Medusa now returns shipping/payment amounts in major units (decimals), same scale as
// `price.amount`. The previous ÷100 normaliser was double-dividing and turning $16.50 shipping into
// $0.17 on the order confirmation page.
const normalizeOrderUnits = <T extends Record<string, any>>(order: T): T => order

export const retrieveOrder = cache(async function (id: string) {
  return sdk.store.order
    .retrieve(
      id,
      { fields: ORDER_FIELDS },
      { next: { tags: ["order"] }, ...getAuthHeaders() }
    )
    .then(({ order }) => normalizeOrderUnits(order as any))
    .catch((err) => medusaError(err))
})

export const listOrders = cache(async function (
  limit: number = 10,
  offset: number = 0
) {
  return sdk.store.order
    .list(
      { limit, offset, fields: ORDER_FIELDS },
      { next: { tags: ["order"] }, ...getAuthHeaders() }
    )
    .then(({ orders }) => orders.map((o: any) => normalizeOrderUnits(o)))
    .catch((err) => medusaError(err))
})

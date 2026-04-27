"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { getAuthHeaders } from "./cookies"

const ORDER_FIELDS =
  "*payment_collections.payments,*fulfillments,+fulfillments.metadata,+fulfillments.labels,*shipping_methods,+shipping_methods.detail"

export const retrieveOrder = cache(async function (id: string) {
  return sdk.store.order
    .retrieve(
      id,
      { fields: ORDER_FIELDS },
      { next: { tags: ["order"] }, ...getAuthHeaders() }
    )
    .then(({ order }) => order)
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
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
})

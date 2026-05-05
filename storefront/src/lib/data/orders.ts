"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { getAuthHeaders } from "./cookies"

const ORDER_FIELDS =
  "*payment_collections.payments,*fulfillments,+fulfillments.metadata,+fulfillments.labels,*shipping_methods,+shipping_methods.detail"

const toMajor = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n / 100 : n

const normalizeOrderUnits = <T extends Record<string, any>>(order: T): T => {
  if (!order) return order
  if (typeof order.shipping_total === "number") {
    order.shipping_total = toMajor(order.shipping_total) as any
  }
  if (Array.isArray(order.shipping_methods)) {
    for (const sm of order.shipping_methods) {
      if (sm && typeof sm.total === "number") sm.total = toMajor(sm.total)
    }
  }
  if (Array.isArray(order.payment_collections)) {
    for (const pc of order.payment_collections) {
      if (pc && Array.isArray(pc.payments)) {
        for (const p of pc.payments) {
          if (p && typeof p.amount === "number") p.amount = toMajor(p.amount)
        }
      }
    }
  }
  return order
}

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

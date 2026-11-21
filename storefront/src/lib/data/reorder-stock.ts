"use server"

import { sdk } from "@lib/config"

export type ReorderStockLine = {
  line_item_id: string
  title: string
  variant_title: string | null
  wanted: number
  available: number | null
  ok: boolean
  suggestion?: { variant_id: string; title: string; available: number | null }
}

/** Stock for each line of an order. Returns null on any failure: callers carry on as before. */
export async function getReorderStock(orderId: string, lineIds?: string[]): Promise<ReorderStockLine[] | null> {
  const { getAuthHeaders } = await import("./cookies")
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch(
      `/store/customers/me/orders/${encodeURIComponent(orderId)}/order-again/stock`,
      { method: "GET", headers }
    )) as { lines?: ReorderStockLine[] }
    const lines = res.lines ?? []
    return lineIds?.length ? lines.filter((l) => lineIds.includes(l.line_item_id)) : lines
  } catch {
    return null
  }
}

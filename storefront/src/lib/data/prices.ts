"use server"

import { sdk } from "@lib/config"

import { getAuthHeaders } from "./cookies"

export type PriceRange = { min: number; max: number } | null

export type PriceList = {
  generated_at: string
  currency_code: string
  /** The customer's pricing level, when they have one. */
  tier: string | null
  breaks: Array<{ label: string; min_quantity: number }>
  garments: Array<{
    product_id: string
    title: string
    handle: string | null
    thumbnail: string | null
    source: "ordered" | "shared"
    prices: PriceRange[]
  }>
  decoration: Array<{
    title: string
    note: string
    columns: string[]
    rows: Array<{ label: string; prices: number[] }>
  }>
}

export async function getMyPriceList(): Promise<PriceList | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return null
  try {
    const res = (await sdk.client.fetch("/store/customers/me/prices", { headers })) as { price_list?: PriceList }
    return res.price_list ?? null
  } catch {
    return null
  }
}

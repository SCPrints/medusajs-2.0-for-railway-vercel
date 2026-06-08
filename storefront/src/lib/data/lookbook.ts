"use server"

import { sdk } from "@lib/config"

export type LookbookItem = {
  id: string
  title: string
  description: string | null
  image_url: string
  attribution: string | null
  tags: string[]
  product_ids: string[]
}

export type LookbookPage = {
  items: LookbookItem[]
  /** Total published tiles (across all pages). */
  count: number
  /** Page size used for the query. */
  limit: number
  /** Global tag universe across all published tiles (stable across pages). */
  tags: string[]
}

export const LOOKBOOK_PAGE_SIZE = 24

export async function getLookbookPage(
  page = 1,
  limit = LOOKBOOK_PAGE_SIZE
): Promise<LookbookPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const offset = (safePage - 1) * limit
  try {
    const res = (await sdk.client.fetch("/store/lookbook", {
      query: { limit, offset },
    })) as {
      items?: LookbookItem[]
      count?: number
      limit?: number
      tags?: string[]
    }
    return {
      items: res.items ?? [],
      count: res.count ?? 0,
      limit: res.limit ?? limit,
      tags: res.tags ?? [],
    }
  } catch {
    return { items: [], count: 0, limit, tags: [] }
  }
}

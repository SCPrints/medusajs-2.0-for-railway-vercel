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

// NOTE: this file is "use server" — it may ONLY export async functions (and
// types). Do not add non-async `export const` here or the whole module fails
// to compile. Page size lives in the page component instead.
export async function getLookbookPage(
  page = 1,
  limit = 24
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

// Fisher–Yates shuffle (non-exported helper — "use server" only restricts
// EXPORTS to async functions).
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Home "Our recent work" rail. Unlike the curated /lookbook page (weight ASC),
// the home rail rotates: each load pulls a random window of published tiles and
// shuffles it, so the rail cycles through the WHOLE lookbook over time instead
// of always showing the oldest/lowest-weight tiles.
export async function getLookbookHomeRail(
  limit = 8
): Promise<LookbookItem[]> {
  // First page also returns the total count in a single round-trip.
  const first = await getLookbookPage(1, limit)
  if (first.count <= limit) {
    return shuffle(first.items)
  }

  const maxOffset = first.count - limit
  const offset = Math.floor(Math.random() * (maxOffset + 1))
  try {
    const res = (await sdk.client.fetch("/store/lookbook", {
      query: { limit, offset },
    })) as { items?: LookbookItem[] }
    const items = res.items ?? []
    return shuffle(items.length ? items : first.items)
  } catch {
    return shuffle(first.items)
  }
}

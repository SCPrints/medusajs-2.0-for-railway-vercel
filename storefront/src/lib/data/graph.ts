import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import type { GraphPayload } from "../../types/graph"

/**
 * Summary payload for `/explore`, cached like every other catalog fetcher in
 * lib/data (`"use cache: remote"` + tags). The `graph` and `categories` tags
 * are already purged by the backend → `/api/revalidate-products` hook, so the
 * page is served from the static shell and refreshes behind the scenes.
 *
 * Client-side expansions (brand / category / type / tag) live in
 * `@modules/graph/hooks/use-graph-expansion` and call the backend directly.
 */
export async function getGraphSummary(): Promise<GraphPayload> {
  "use cache: remote"
  cacheTag("graph", "products", "categories")
  cacheLife({ revalidate: 3600, stale: 86400, expire: 86400 })

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
  if (key) headers["x-publishable-api-key"] = key

  const url = `${MEDUSA_BACKEND_URL}/store/graph?mode=summary`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`
    )
  }
  return (await response.json()) as GraphPayload
}

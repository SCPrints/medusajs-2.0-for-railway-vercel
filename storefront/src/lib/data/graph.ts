import "server-only"

import type { GraphPayload } from "../../types/graph"

/**
 * Server-only fetchers for the Medusa `/store/graph` custom route.
 *
 * These mirror the caching pattern used in `@lib/data/products` — Next.js
 * `fetch` with tags so on-demand revalidation purges the graph alongside the
 * product catalog. The underlying backend route also sets a `Cache-Control`
 * header, so Vercel's edge can serve a warm copy between revalidations.
 */

const GRAPH_TAGS = ["graph", "products", "categories", "collections"] as const
const GRAPH_REVALIDATE_SECONDS = 300

function getBackendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_MEDUSA_BACKEND_URL is not set; cannot reach /store/graph"
    )
  }
  return raw.replace(/\/+$/, "").replace(/\/store$/, "")
}

function buildGraphUrl(params: Record<string, string | number | undefined>): string {
  const base = getBackendBaseUrl()
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    qs.set(key, String(value))
  }
  const query = qs.toString()
  return `${base}/store/graph${query ? `?${query}` : ""}`
}

function getPublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim() || null
}

async function fetchGraph(
  params: Record<string, string | number | undefined>,
  tags: readonly string[] = GRAPH_TAGS
): Promise<GraphPayload> {
  const url = buildGraphUrl(params)
  const key = getPublishableKey()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (key) {
    headers["x-publishable-api-key"] = key
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    next: {
      tags: tags as string[],
      revalidate: GRAPH_REVALIDATE_SECONDS,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}${
        text ? ` — ${text.slice(0, 200)}` : ""
      }`
    )
  }

  return (await response.json()) as GraphPayload
}

export async function getGraphSummary(): Promise<GraphPayload> {
  return fetchGraph({ mode: "summary" }, ["graph", "categories", "collections"])
}

export async function getGraphForBrand(
  brand: string,
  options: { limit?: number; offset?: number } = {}
): Promise<GraphPayload> {
  const { limit = 200, offset = 0 } = options
  return fetchGraph(
    {
      mode: "brand",
      brand,
      limit,
      offset,
    },
    ["graph", "products"]
  )
}

export async function getGraphForCategory(
  categoryId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<GraphPayload> {
  const { limit = 200, offset = 0 } = options
  return fetchGraph(
    {
      mode: "category",
      category_id: categoryId,
      limit,
      offset,
    },
    ["graph", "products", "categories"]
  )
}

export async function getGraphAll(
  options: { limit?: number; offset?: number } = {}
): Promise<GraphPayload> {
  const { limit = 500, offset = 0 } = options
  return fetchGraph({ mode: "all", limit, offset }, GRAPH_TAGS)
}

import { NextResponse } from "next/server"

import { getCategoryByHandle } from "@lib/data/categories"
import { getProductByHandle, getProductsById } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"

/**
 * TEMPORARY diagnostic (2026-09-10). Calls the same `"use cache"` functions
 * the PDP uses, from a route handler, and reports wall time + the fetch
 * timestamp getProductByHandle stamps inside its cached body. Hit it twice:
 * equal `fetchedAt` / ~0ms on the second call = the entry is served from
 * cache in this context; a fresh timestamp each time = it never persists.
 * Read-only; remove once the use-cache miss is resolved.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const handle = (url.searchParams.get("handle") ?? "as-colour-1000-1000").toLowerCase()
  const category = url.searchParams.get("category") ?? "mens-polos"

  const t0 = Date.now()
  const region = await getRegion("au")
  const tRegion = Date.now() - t0
  if (!region) return NextResponse.json({ error: "no region" }, { status: 500 })

  const t1 = Date.now()
  const product = await getProductByHandle(handle, region.id)
  const tByHandle = Date.now() - t1

  const t2 = Date.now()
  const byId = product?.id
    ? await getProductsById({ ids: [product.id], regionId: region.id })
    : []
  const tById = Date.now() - t2

  const t3 = Date.now()
  const cat = await getCategoryByHandle([category])
  const tCategory = Date.now() - t3

  return NextResponse.json({
    now: Date.now(),
    handle,
    region: { id: region.id, ms: tRegion },
    byHandle: {
      ms: tByHandle,
      variants: product?.variants?.length ?? 0,
      fetchedAt: (product as { __fetchedAt?: number } | null)?.__fetchedAt ?? null,
    },
    byId: { ms: tById, count: byId.length },
    category: { ms: tCategory, found: cat.product_categories?.length ?? 0 },
  })
}

import { NextResponse } from "next/server"
import { cacheLife, cacheTag } from "next/cache"

import { sdk } from "@lib/config"
import { getCategoryByHandle } from "@lib/data/categories"
import { getProductByHandle, getProductsById } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"

/**
 * TEMPORARY diagnostic (2026-09-10). Isolates why product-tagged "use cache"
 * entries never hit on prod while category ones do. Each probe below differs
 * from its neighbour in exactly one property. A probe whose `t` changes on
 * every call is not persisting. Read-only; remove once resolved.
 */

// A: tag "products", revalidate 120 — same directives as getProductByHandle.
async function probeA() {
  "use cache"
  cacheTag("products")
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  return Date.now()
}

// B: tag "categories", revalidate 600 — same as getCategoryByHandle (works).
async function probeB() {
  "use cache"
  cacheTag("categories")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return Date.now()
}

// E: tag "products", revalidate 600 — isolates the tag from the lifetime.
async function probeE() {
  "use cache"
  cacheTag("products")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return Date.now()
}

// F: tag "categories", revalidate 120 — the mirror of E.
async function probeF() {
  "use cache"
  cacheTag("categories")
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  return Date.now()
}

// C: the real Medusa product call, but with the category directives.
async function probeC(handle: string, regionId: string) {
  "use cache"
  cacheTag("categories")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  const { products } = await sdk.store.product.list({
    handle,
    region_id: regionId,
    fields: "id,title,+variants.calculated_price",
  } as never)
  return { t: Date.now(), variants: products[0]?.variants?.length ?? 0 }
}

// G: no tag at all, default lifetime.
async function probeG() {
  "use cache"
  return Date.now()
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = Date.now()
  const value = await fn()
  return { ms: Date.now() - t0, value }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const handle = (url.searchParams.get("handle") ?? "as-colour-1000-1000").toLowerCase()
  const category = url.searchParams.get("category") ?? "mens-polos"

  const region = await getRegion("au")
  if (!region) return NextResponse.json({ error: "no region" }, { status: 500 })

  const byHandle = await timed(() => getProductByHandle(handle, region.id))
  const byId = await timed(() =>
    byHandle.value?.id
      ? getProductsById({ ids: [byHandle.value!.id], regionId: region.id })
      : Promise.resolve([])
  )
  const cat = await timed(() => getCategoryByHandle([category]))

  const [a, b, e, f, c, g] = await Promise.all([
    timed(probeA),
    timed(probeB),
    timed(probeE),
    timed(probeF),
    timed(() => probeC(handle, region.id)),
    timed(probeG),
  ])

  // Runtime introspection: which cache handlers are registered, whether the
  // Vercel remote cache env is present (names only, never values), draft mode,
  // and a per-instance id so consecutive calls can be told apart by instance.
  const glob = globalThis as Record<PropertyKey, unknown>
  const instanceKey = "__scpCacheProbeInstance"
  glob[instanceKey] ??= Math.random().toString(36).slice(2, 8)
  const handlersSym = Symbol.for("@next/cache-handlers")
  const handlersMapSym = Symbol.for("@next/cache-handlers-map")
  const handlers = glob[handlersSym] as Record<string, unknown> | undefined
  const handlersMap = glob[handlersMapSym] as Map<string, unknown> | undefined
  const { draftMode } = await import("next/headers")
  const dm = await draftMode()
  const envKeys = Object.keys(process.env)
    .filter((k) => /CACHE|SUSPENSE|VERCEL_(ENV|REGION|DEPLOYMENT_ID)|NEXT_RUNTIME|NEXT_PRIVATE/i.test(k))
    .sort()

  // Direct handler plumbing test. `?op=set` writes a tiny entry into every
  // registered handler; `?op=get` (a later request) reads it back. Tells us
  // whether set/get work at all, independent of the "use cache" wrapper.
  type Handler = {
    get: (key: string, implicitTags?: string[]) => Promise<unknown>
    set: (key: string, pending: Promise<unknown>) => Promise<void>
  }
  const op = url.searchParams.get("op")
  const probeKey = "scp-cache-probe-v1"
  const handlerTest: Record<string, unknown> = {}
  if (handlersMap && (op === "set" || op === "get")) {
    for (const [name, h] of Array.from(handlersMap.entries())) {
      const handler = h as Handler
      try {
        if (op === "set") {
          const bytes = new TextEncoder().encode(String(Date.now()))
          await handler.set(
            probeKey,
            Promise.resolve({
              value: new ReadableStream({
                start(c) {
                  c.enqueue(bytes)
                  c.close()
                },
              }),
              tags: [],
              stale: 300,
              timestamp: Date.now(),
              expire: 86400,
              revalidate: 600,
            })
          )
          handlerTest[name] = "set ok"
        } else {
          const entry = (await handler.get(probeKey, [])) as
            | { timestamp?: number; value?: ReadableStream }
            | undefined
          if (!entry) {
            handlerTest[name] = "get -> undefined"
          } else {
            let text = ""
            try {
              const reader = entry.value?.getReader()
              const { value } = (await reader?.read()) ?? {}
              text = value ? new TextDecoder().decode(value) : ""
            } catch (e) {
              text = `read err ${(e as Error).message}`
            }
            handlerTest[name] = { timestamp: entry.timestamp, storedAt: text }
          }
        }
      } catch (e) {
        handlerTest[name] = `${op} err ${(e as Error).message}`
      }
    }
  }

  return NextResponse.json({
    now: Date.now(),
    runtime: {
      instance: glob[instanceKey],
      node: process.version,
      draftMode: dm.isEnabled,
      cacheHandlers: handlers ? Object.keys(handlers) : null,
      cacheHandlersMap: handlersMap ? Array.from(handlersMap.keys()) : null,
      envKeys,
      envFlags: {
        VERCEL_CACHE_HANDLER_MEMORY_CACHE: process.env.VERCEL_CACHE_HANDLER_MEMORY_CACHE ?? null,
        VERCEL_VDC_REMOTE_CACHE_ENABLED: process.env.VERCEL_VDC_REMOTE_CACHE_ENABLED ?? null,
      },
      handlerTest,
    },
    handle,
    real: {
      byHandle: {
        ms: byHandle.ms,
        fetchedAt: (byHandle.value as { __fetchedAt?: number } | null)?.__fetchedAt ?? null,
      },
      byId: { ms: byId.ms, count: byId.value.length },
      category: { ms: cat.ms, found: cat.value.product_categories?.length ?? 0 },
    },
    probes: {
      A_products_120: a,
      B_categories_600: b,
      E_products_600: e,
      F_categories_120: f,
      C_sdkProduct_categories_600: c,
      G_untagged_default: g,
    },
  })
}

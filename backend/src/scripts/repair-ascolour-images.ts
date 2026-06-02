/**
 * Repair AS Colour product images: remove confirmed-dead (404/410) image URLs
 * and recover working replacements from the API's other size variants.
 *
 * Context: the AS Colour API's image list includes records whose `urlZoom`
 * (1280px) URL 404s even though a smaller size of the same shot — or another
 * shot of the same colour — is live. `refresh-ascolour-images.ts` trusted the
 * API and wrote those dead URLs onto products, so PDP galleries render broken
 * images. This script undoes that damage everywhere it occurred and is robust
 * against it recurring.
 *
 * Strategy, per AS Colour product:
 *   1. Liveness-check every CURRENT product image (reuses image-audit's
 *      checkImageUrl: HEAD then ranged-GET fallback — only 404/410 is "dead").
 *   2. If nothing is confirmed-dead → skip (no write). Protects the healthy
 *      majority and never churns on a transient blip.
 *   3. Otherwise re-fetch the API image set and, for each record, pick the
 *      first LIVE url among urlZoom → urlStandard → urlThumbnail → urlTiny.
 *   4. Final image list = (current images that are NOT confirmed-dead) ∪
 *      (recovered live API urls), deduped by normalised path. We only ever
 *      DROP a url that is confirmed 404/410 — uncertain results (timeout, 5xx,
 *      403) are kept, so we never lose a good image to a transient error.
 *   5. Repoint the thumbnail to a live MAIN/FRONT shot.
 *   6. Write only if the set actually changed.
 *
 * Idempotent and safe to re-run. Verifies nothing it writes is dead.
 *
 * Usage:
 *   # Local
 *   cd backend && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/repair-ascolour-images.ts
 *   cd backend && npx medusa exec src/scripts/repair-ascolour-images.ts
 *   # Prod (Fly)
 *   cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/repair-ascolour-images.js
 *   cd /app/.medusa/server && npx medusa exec src/scripts/repair-ascolour-images.js
 *
 * Env vars:
 *   IMPORT_DRY_RUN=1      — report only, write nothing.
 *   IMPORT_LIMIT=N        — process at most N AS Colour products.
 *   ONLY_STYLES=5080,4080 — restrict to these styleCodes.
 *   CHECK_TIMEOUT_MS=12000 — per-URL liveness timeout.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { AsColourImage } from "../modules/ascolour/types"
import { checkImageUrl } from "../services/image-audit/check"

const PAGE_SIZE = 100
const HEAD_CONCURRENCY = 8

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

// API size variants, best resolution first.
const sizeVariants = (img: any): string[] =>
  [img.urlZoom, img.urlStandard, img.urlThumbnail, img.urlTiny].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  )

const normKey = (url: string): string => {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).toLowerCase()
  } catch {
    return url.split("?")[0].toLowerCase()
  }
}

const fileName = (url: string): string => {
  try {
    return (new URL(url).pathname.split("/").pop() ?? "").toUpperCase()
  } catch {
    return url.toUpperCase()
  }
}

const pickThumbnail = (urls: string[]): string => {
  const score = (url: string): number => {
    const f = fileName(url)
    if (f.includes("THUMB")) return -2
    if (f.includes("_BACK")) return -1
    if (f.includes("MAIN")) return 3
    if (f.includes("FRONT")) return 2
    return 0
  }
  let best = urls[0]
  let bestScore = score(urls[0])
  for (const url of urls) {
    const s = score(url)
    if (s > bestScore) {
      best = url
      bestScore = s
    }
  }
  return best
}

// Run async fn over items with a small concurrency cap.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export default async function repairAsColourImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService
  const productModule = container.resolve(Modules.PRODUCT) as unknown as {
    updateProducts?: (
      id: string,
      data: { thumbnail?: string; images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }
  if (typeof productModule.updateProducts !== "function") {
    throw new Error("Product module updateProducts is unavailable")
  }

  const dryRun =
    process.env.IMPORT_DRY_RUN === "1" || process.env.IMPORT_DRY_RUN === "true"
  const limit = process.env.IMPORT_LIMIT
    ? Number.parseInt(process.env.IMPORT_LIMIT, 10)
    : undefined
  const onlyStyles = new Set(
    (process.env.ONLY_STYLES ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  )
  const timeoutMs = process.env.CHECK_TIMEOUT_MS
    ? Number.parseInt(process.env.CHECK_TIMEOUT_MS, 10)
    : 12000

  logger.info(
    `repair-ascolour-images: dryRun=${dryRun}, limit=${limit ?? "all"}, onlyStyles=${onlyStyles.size ? [...onlyStyles].join(",") : "all"}, timeout=${timeoutMs}ms`
  )

  const isDead = (status: number) => status === 404 || status === 410

  let offset = 0
  let scanned = 0
  let healthy = 0
  let repaired = 0
  let stillBroken = 0
  let apiFailed = 0
  let stopped = false

  while (!stopped) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "thumbnail", "metadata", "images.url", "variants.metadata"],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    if (!page?.length) break
    offset += page.length

    for (const product of page as any[]) {
      const meta = (product.metadata ?? {}) as Record<string, any>
      const isAscolour = meta.source === "ascolour" || meta.ascolour?.styleCode
      if (!isAscolour) continue

      let styleCode: string | undefined = meta.ascolour?.styleCode
      if (!styleCode) {
        for (const v of product.variants ?? []) {
          const vmeta = (v.metadata ?? {}) as Record<string, any>
          if (vmeta.ascolour?.styleCode) { styleCode = vmeta.ascolour.styleCode; break }
        }
      }
      if (!styleCode) continue
      if (onlyStyles.size && !onlyStyles.has(styleCode)) continue

      scanned++
      if (limit && scanned > limit) { stopped = true; break }

      const currentUrls: string[] = (product.images ?? [])
        .map((i: any) => i.url as string)
        .filter(Boolean)
      if (!currentUrls.length) { healthy++; continue }

      // 1. Liveness-check current images.
      const currentChecks = await mapPool(currentUrls, HEAD_CONCURRENCY, async (url) => ({
        url,
        res: await checkImageUrl(url, timeoutMs),
      }))
      const deadCurrent = currentChecks.filter((c) => isDead(c.res.status))
      if (!deadCurrent.length) { healthy++; continue } // nothing confirmed-dead → leave it

      // 2. Re-fetch API and recover live urls (first live size variant per record).
      let apiImages: AsColourImage[] = []
      try {
        apiImages = extractArray<AsColourImage>(
          await ascolour.getClient().getProductImages(styleCode)
        )
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): API fetch failed during recovery — ${err?.message ?? err}`)
        apiFailed++
      }

      const recovered: string[] = []
      for (const img of apiImages as any[]) {
        for (const variant of sizeVariants(img)) {
          const res = await checkImageUrl(variant, timeoutMs)
          if (res.ok) { recovered.push(variant); break }
        }
      }

      // 3. Build final set: keep current images that are NOT confirmed-dead,
      //    then add recovered live urls. Dedupe by normalised path.
      const deadKeys = new Set(deadCurrent.map((c) => normKey(c.url)))
      const seen = new Set<string>()
      const finalUrls: string[] = []
      const add = (url: string) => {
        const k = normKey(url)
        if (deadKeys.has(k) || seen.has(k)) return
        seen.add(k)
        finalUrls.push(url)
      }
      for (const url of currentUrls) add(url) // keeps live + uncertain, skips dead
      for (const url of recovered) add(url)

      if (!finalUrls.length) {
        logger.warn(`  ${product.handle} (${styleCode}): every image is dead and nothing recovered — leaving as-is for manual review`)
        stillBroken++
        continue
      }

      // 4. Thumbnail: live, prefer MAIN/FRONT. Fall back to first final url.
      const liveThumbCandidates = finalUrls.filter((u) => !deadKeys.has(normKey(u)))
      const thumbnail = pickThumbnail(liveThumbCandidates.length ? liveThumbCandidates : finalUrls)

      // 5. No-op if unchanged.
      const currentKeys = new Set(currentUrls.map(normKey))
      const finalKeys = new Set(finalUrls.map(normKey))
      const sameSet =
        currentKeys.size === finalKeys.size && [...finalKeys].every((k) => currentKeys.has(k))
      if (sameSet) { healthy++; continue }

      repaired++
      logger.info(
        `  ${product.handle} (${styleCode}): removed ${deadCurrent.length} dead, recovered ${recovered.length}; ${currentUrls.length} → ${finalUrls.length} image(s); thumb → ${fileName(thumbnail)}`
      )

      if (dryRun) continue
      try {
        await productModule.updateProducts!(product.id, {
          thumbnail,
          images: finalUrls.map((url) => ({ url })),
        })
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): updateProducts failed — ${err?.message ?? err}`)
        repaired--
      }
    }
    if (page.length < PAGE_SIZE) break
  }

  logger.info("---")
  logger.info(
    `Done. scanned=${scanned}, ${dryRun ? "would repair" : "repaired"}=${repaired}, healthy/untouched=${healthy}, still-broken(manual)=${stillBroken}, api-fetch-failed=${apiFailed}.`
  )
}

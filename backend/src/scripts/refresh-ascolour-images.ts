/**
 * Refresh AS Colour product images from the live AS Colour API.
 *
 * The AS Colour importer is create-only — it never re-fetches images for an
 * existing product. So styles imported before AS Colour published their full
 * per-colour photo set (e.g. the 5080 Heavy Tee: 11 images in DB, 36 on the
 * API) are missing colour photos, and the storefront PDP falls back to the
 * generic black hero shots for those colours ("Red swatch shows a black tee").
 *
 * This script walks every AS Colour product, re-fetches the API image set, and
 * replaces product.images with the canonical API URLs when they differ. The
 * storefront already maps colour → photo by the colour name embedded in the
 * filename, so no storefront change is needed — the missing colour photos start
 * matching as soon as they land in product.images.
 *
 * Idempotent: a product whose image set already equals the API set (compared by
 * normalised path, ignoring case + query string) is skipped. Safe to re-run.
 *
 * Usage:
 *   # Local
 *   cd backend && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/refresh-ascolour-images.ts
 *   cd backend && npx medusa exec src/scripts/refresh-ascolour-images.ts
 *   # Prod (Fly)
 *   cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/refresh-ascolour-images.js
 *   cd /app/.medusa/server && npx medusa exec src/scripts/refresh-ascolour-images.js
 *
 * Env vars:
 *   IMPORT_DRY_RUN=1      — log what would change, write nothing.
 *   IMPORT_LIMIT=N        — process at most N AS Colour products.
 *   ONLY_STYLES=5080,4093 — restrict to these styleCodes (validate before going wide).
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { AsColourImage } from "../modules/ascolour/types"

const PAGE_SIZE = 100

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

const pickUrl = (img: any): string | undefined =>
  img.urlZoom || img.urlStandard || img.urlThumbnail || img.urlTiny

// Comparison key: lowercased path, query string stripped. Lets us treat
// ".../FOO.jpg?c=1" and ".../FOO.JPG" as the same image so genuinely-current
// products are skipped instead of needlessly rewritten.
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

// Pick the best hero/thumbnail: prefer a MAIN or FRONT studio shot, avoid the
// catalog "THUMB" asset and BACK views. Falls back to the first URL.
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

export default async function refreshAsColourImages({ container }: ExecArgs) {
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
    (process.env.ONLY_STYLES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )

  logger.info(
    `refresh-ascolour-images: dryRun=${dryRun}, limit=${limit ?? "all"}, onlyStyles=${onlyStyles.size ? Array.from(onlyStyles).join(",") : "all"}`
  )

  let offset = 0
  let scanned = 0
  let alreadyCurrent = 0
  let missingStyleCode = 0
  let apiFailed = 0
  let apiEmpty = 0
  let changed = 0
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
          if (vmeta.ascolour?.styleCode) {
            styleCode = vmeta.ascolour.styleCode
            break
          }
        }
      }
      if (!styleCode) {
        missingStyleCode++
        continue
      }
      if (onlyStyles.size && !onlyStyles.has(styleCode)) continue

      scanned++
      if (limit && scanned > limit) {
        stopped = true
        break
      }

      let apiImages: AsColourImage[]
      try {
        apiImages = extractArray<AsColourImage>(
          await ascolour.getClient().getProductImages(styleCode)
        )
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): API fetch failed — ${err?.message ?? err}`)
        apiFailed++
        continue
      }

      const seen = new Set<string>()
      const newUrls: string[] = []
      for (const img of apiImages as any[]) {
        const url = pickUrl(img)
        if (url && !seen.has(url)) {
          seen.add(url)
          newUrls.push(url)
        }
      }
      if (!newUrls.length) {
        logger.warn(`  ${product.handle} (${styleCode}): API returned no images — leaving as-is`)
        apiEmpty++
        continue
      }

      const currentUrls: string[] = (product.images ?? [])
        .map((i: any) => i.url as string)
        .filter(Boolean)

      // Idempotency: same set of images (by normalised key) → nothing to do.
      const currentKeys = new Set(currentUrls.map(normKey))
      const newKeys = new Set(newUrls.map(normKey))
      const sameSet =
        currentKeys.size === newKeys.size &&
        [...newKeys].every((k) => currentKeys.has(k))
      if (sameSet) {
        alreadyCurrent++
        continue
      }

      const thumbnail = pickThumbnail(newUrls)
      const addedCount = [...newKeys].filter((k) => !currentKeys.has(k)).length
      changed++
      logger.info(
        `  ${product.handle} (${styleCode}): ${currentUrls.length} → ${newUrls.length} image(s) (+${addedCount} new); thumb → ${fileName(thumbnail)}`
      )

      if (dryRun) continue

      try {
        await productModule.updateProducts!(product.id, {
          thumbnail,
          images: newUrls.map((url) => ({ url })),
        })
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): updateProducts failed — ${err?.message ?? err}`)
        changed--
      }
    }

    if (page.length < PAGE_SIZE) break
  }

  logger.info("---")
  logger.info(
    `Done. scanned=${scanned}, ${dryRun ? "would change" : "changed"}=${changed}, already-current=${alreadyCurrent}, api-empty=${apiEmpty}, api-failed=${apiFailed}, missing-styleCode=${missingStyleCode}.`
  )
  if (!dryRun && changed > 0) {
    logger.info(
      "Note: images were written via the product module directly. If storefront PDPs still show stale photos, the Next.js cache may need a revalidate / the page TTL to lapse."
    )
  }
}

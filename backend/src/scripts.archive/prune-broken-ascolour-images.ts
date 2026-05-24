/**
 * Walk every AS Colour product, HEAD-check each image URL, and remove the
 * ones that return 404. AS Colour's BigCommerce CDN periodically rotates
 * image IDs (verified empirically — e.g. style 5080 Heavy Tee has roughly
 * a third of its image IDs broken even though the importer just ran). The
 * AS Colour API itself returns the same dead URLs, so re-importing doesn't
 * fix it — only filtering out the 404s does.
 *
 * Idempotent: products whose URLs all still resolve are skipped. Products
 * with no surviving images keep their current image list (we never wipe
 * the gallery entirely — better to render one broken image than zero).
 *
 * Usage:
 *   # Local
 *   cd backend && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/prune-broken-ascolour-images.ts
 *   cd backend && npx medusa exec src/scripts/prune-broken-ascolour-images.ts
 *
 *   # Fly
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/prune-broken-ascolour-images.js
 *   cd /app/.medusa/server && npx medusa exec src/scripts/prune-broken-ascolour-images.js
 *
 * Env vars:
 *   IMPORT_DRY_RUN=1  — log what would change, write nothing
 *   IMPORT_LIMIT=N    — cap product count (default: all)
 *   IMPORT_HANDLE=h   — restrict to a single handle (e.g. as-colour-5080-5080)
 *   HEAD_CONCURRENCY  — parallel HEAD requests (default 8)
 *   HEAD_TIMEOUT_MS   — per-request timeout (default 8000)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const PAGE_SIZE = 100

type ProductRow = {
  id: string
  handle: string | null
  thumbnail: string | null
  metadata: Record<string, any> | null
  images: Array<{ url: string }> | null
}

const isOk = (status: number) => status >= 200 && status < 400

async function headCheck(url: string, timeoutMs: number): Promise<number> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal })
    return r.status
  } catch {
    return 0 // network error / abort → treat as broken
  } finally {
    clearTimeout(t)
  }
}

async function checkAll(
  urls: string[],
  concurrency: number,
  timeoutMs: number
): Promise<Map<string, number>> {
  const results = new Map<string, number>()
  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      const idx = cursor++
      const url = urls[idx]
      results.set(url, await headCheck(url, timeoutMs))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker)
  )
  return results
}

export default async function pruneBrokenAsColourImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const dryRun =
    process.env.IMPORT_DRY_RUN === "1" || process.env.IMPORT_DRY_RUN === "true"
  const limit = process.env.IMPORT_LIMIT
    ? Number.parseInt(process.env.IMPORT_LIMIT, 10)
    : undefined
  const onlyHandle = process.env.IMPORT_HANDLE?.trim() || undefined
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.HEAD_CONCURRENCY || "8", 10) || 8
  )
  const timeoutMs = Math.max(
    500,
    Number.parseInt(process.env.HEAD_TIMEOUT_MS || "8000", 10) || 8000
  )

  logger.info(
    `prune-broken-ascolour-images: dryRun=${dryRun}, limit=${limit ?? "all"}, handle=${onlyHandle ?? "all"}, concurrency=${concurrency}, timeoutMs=${timeoutMs}`
  )

  let scanned = 0
  let checked = 0
  let unchanged = 0
  let pruned = 0
  let allGone = 0
  let updated = 0
  let totalUrlsChecked = 0
  let totalUrlsDropped = 0

  let offset = 0
  outer: while (true) {
    const filters: Record<string, any> = onlyHandle ? { handle: onlyHandle } : {}
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "thumbnail", "metadata", "images.url"],
      filters,
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    const rows = (page ?? []) as ProductRow[]
    if (!rows.length) break

    for (const product of rows) {
      const meta = (product.metadata ?? {}) as Record<string, any>
      const isAscolour =
        meta.source === "ascolour" || meta.ascolour?.styleCode
      if (!isAscolour) continue

      scanned++
      if (limit && scanned > limit) {
        scanned-- // don't count the one we're about to skip
        break outer
      }

      const currentUrls = (product.images ?? [])
        .map((i) => i.url)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
      if (currentUrls.length === 0) {
        unchanged++
        continue
      }

      checked++
      totalUrlsChecked += currentUrls.length
      const statusByUrl = await checkAll(currentUrls, concurrency, timeoutMs)
      const goodUrls = currentUrls.filter((u) => isOk(statusByUrl.get(u) ?? 0))
      const droppedUrls = currentUrls.filter((u) => !isOk(statusByUrl.get(u) ?? 0))

      if (droppedUrls.length === 0) {
        unchanged++
        continue
      }

      pruned++
      totalUrlsDropped += droppedUrls.length

      if (goodUrls.length === 0) {
        allGone++
        logger.warn(
          `  ${product.handle}: all ${currentUrls.length} images return non-2xx — keeping current list to avoid an empty gallery`
        )
        continue
      }

      const droppedThumbnail =
        product.thumbnail &&
        droppedUrls.includes(product.thumbnail) &&
        !goodUrls.includes(product.thumbnail)
      const newThumbnail = droppedThumbnail ? goodUrls[0] : product.thumbnail
      logger.info(
        `  ${product.handle}: kept ${goodUrls.length}/${currentUrls.length}, dropped ${droppedUrls.length}${droppedThumbnail ? `, thumbnail → ${newThumbnail}` : ""}`
      )

      if (dryRun) continue

      try {
        await productModule.updateProducts(product.id, {
          images: goodUrls.map((url) => ({ url })),
          ...(droppedThumbnail ? { thumbnail: newThumbnail ?? undefined } : {}),
        })
        updated++
      } catch (err: any) {
        logger.warn(
          `  ${product.handle}: updateProducts failed — ${err?.message ?? err}`
        )
      }
    }

    if (rows.length < PAGE_SIZE) break
    offset += rows.length
  }

  logger.info(
    `Done. AS Colour products scanned: ${scanned}, checked: ${checked}, unchanged: ${unchanged}, pruned: ${pruned}${dryRun ? " (would update)" : ` (updated: ${updated})`}, all-images-gone: ${allGone}.`
  )
  logger.info(
    `URLs checked: ${totalUrlsChecked}, ${totalUrlsDropped} dropped (${totalUrlsChecked ? ((totalUrlsDropped / totalUrlsChecked) * 100).toFixed(1) : 0}%).`
  )
}

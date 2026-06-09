/**
 * Product-image audit runner.
 *
 * Walks products, HEAD-checks the thumbnail AND every gallery image, and
 * stamps `product.metadata.image_audit = { status, checked_at, status_code,
 * broken_count, broken_urls }` on the ones whose broken-ness changed. The
 * "Broken image" data-quality flag in /app/product-data reads
 * `image_audit.status === "broken"`.
 *
 * Gallery scope matters: thumbnail-only auditing misses per-colour rot — a
 * supplier CDN rotating individual colour files leaves the thumbnail healthy
 * while that colour's PDP gallery + customizer canvas break (2026-06-10
 * incident). ~1.3k products / ~27k URLs keeps the weekly sweep under an hour.
 *
 * Called from two places:
 *   - the weekly cron ([jobs/audit-product-images.ts]) — full catalog
 *   - the on-demand admin endpoint ([api/admin/products-manager/image-audit])
 *     — fired in the background so a click returns immediately
 *
 * Single-flight: module-level state guards against a manual run and the
 * cron (or two manual clicks) overlapping. State is in-process only — it
 * resets on redeploy, which is fine for a progress hint.
 */

import {
  checkImageUrl,
  classifyProductImages,
  shouldStamp,
  type ImageAuditStatus,
} from "./check"

const PAGE_SIZE = 100
const DEFAULT_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 8000

export type ImageAuditSummary = {
  scanned: number
  checked: number
  broken_found: number
  cleared: number
  updated: number
  errors: number
  scope: string
  started_at: string
  finished_at: string
}

type AuditState = {
  in_progress: boolean
  started_at: string | null
  scope: string | null
  last_run: ImageAuditSummary | null
}

const state: AuditState = {
  in_progress: false,
  started_at: null,
  scope: null,
  last_run: null,
}

export function getImageAuditState(): AuditState {
  return { ...state }
}

export type AuditDeps = {
  query: { graph: (a: Record<string, unknown>) => Promise<{ data?: any[] }> }
  productModule: {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  logger: { info: (m: string) => void; warn: (m: string) => void }
}

export type AuditOptions = {
  /** Restrict to a single brand (resolves brand → product ids first). */
  brandId?: string
  /** Cap how many products to scan (testing / scoped runs). */
  limit?: number
  concurrency?: number
  timeoutMs?: number
  /** Free-text label for logs + PostHog (e.g. "cron", "manual"). */
  source?: string
  /** Optional PostHog emitter — passed in so this stays dep-light. */
  capture?: (event: string, props: Record<string, any>) => void
}

type ProductRow = {
  id: string
  handle: string | null
  thumbnail: string | null
  images?: Array<{ url?: string | null }> | null
  metadata: Record<string, any> | null
}

/** Unique, trimmed thumbnail + gallery URLs for one product. */
const productImageUrls = (p: ProductRow): string[] => {
  const urls = new Set<string>()
  if (typeof p.thumbnail === "string" && p.thumbnail.trim()) {
    urls.add(p.thumbnail.trim())
  }
  for (const img of p.images ?? []) {
    if (typeof img?.url === "string" && img.url.trim()) {
      urls.add(img.url.trim())
    }
  }
  return [...urls]
}

/** Cap stored broken-URL lists so product metadata stays bounded. */
const BROKEN_URLS_STAMP_CAP = 20

async function resolveBrandProductIds(
  deps: AuditDeps,
  brandId: string
): Promise<string[]> {
  const { data = [] } = await deps.query.graph({
    entity: "brand",
    fields: ["id", "products.id"],
    filters: { id: [brandId] },
    pagination: { take: 1, skip: 0 },
  })
  const ids = new Set<string>()
  for (const b of data as any[]) {
    for (const p of Array.isArray(b?.products) ? b.products : []) {
      if (p?.id) ids.add(p.id)
    }
  }
  return [...ids]
}

/** Concurrent HEAD/GET checks over a page's thumbnail URLs. */
async function checkUrls(
  urls: string[],
  concurrency: number,
  timeoutMs: number
): Promise<Map<string, { ok: boolean; status: number }>> {
  const out = new Map<string, { ok: boolean; status: number }>()
  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      out.set(url, await checkImageUrl(url, timeoutMs))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker)
  )
  return out
}

/**
 * Run the audit. Returns a summary; also records it in module state.
 * Returns `null` immediately if a run is already in progress.
 */
export async function runImageAudit(
  deps: AuditDeps,
  opts: AuditOptions = {}
): Promise<ImageAuditSummary | null> {
  if (state.in_progress) return null

  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY)
  const timeoutMs = Math.max(500, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const scope = opts.brandId ? `brand:${opts.brandId}` : "all"
  const startedAt = new Date().toISOString()

  state.in_progress = true
  state.started_at = startedAt
  state.scope = scope

  const summary: ImageAuditSummary = {
    scanned: 0,
    checked: 0,
    broken_found: 0,
    cleared: 0,
    updated: 0,
    errors: 0,
    scope,
    started_at: startedAt,
    finished_at: startedAt,
  }

  deps.logger.info(
    `image-audit: start source=${opts.source ?? "?"} scope=${scope} concurrency=${concurrency} timeoutMs=${timeoutMs}`
  )

  const fields = ["id", "handle", "thumbnail", "images.url", "metadata"]

  const processPage = async (rows: ProductRow[]) => {
    if (opts.limit && summary.scanned >= opts.limit) return false
    let page = rows
    if (opts.limit) {
      const room = opts.limit - summary.scanned
      page = rows.slice(0, Math.max(0, room))
    }
    summary.scanned += page.length

    // Check thumbnail + every gallery image. Only populated URLs need a
    // network check; products with no images at all are "missing" (the
    // existing flag owns them).
    const urls = [...new Set(page.flatMap(productImageUrls))]
    const statusByUrl = urls.length
      ? await checkUrls(urls, concurrency, timeoutMs)
      : new Map()
    summary.checked += urls.length

    for (const p of page) {
      const thumb =
        typeof p.thumbnail === "string" ? p.thumbnail.trim() : ""
      const thumbCheck = thumb ? statusByUrl.get(thumb) ?? null : null

      const classification = classifyProductImages(
        p.thumbnail,
        (p.images ?? []).map((i) => i?.url),
        statusByUrl
      )
      const next = classification.status
      const prev = (p.metadata?.image_audit?.status ?? undefined) as
        | ImageAuditStatus
        | undefined

      if (next === "broken") summary.broken_found++

      if (!shouldStamp(prev, next)) continue

      if (next !== "broken" && prev === "broken") summary.cleared++

      const nextMeta = {
        ...(p.metadata ?? {}),
        image_audit: {
          status: next,
          status_code: thumbCheck?.status ?? null,
          broken_count: classification.broken_urls.length,
          broken_urls: classification.broken_urls.slice(0, BROKEN_URLS_STAMP_CAP),
          checked_at: new Date().toISOString(),
        },
      }
      try {
        await deps.productModule.updateProducts(p.id, { metadata: nextMeta })
        summary.updated++
        deps.logger.info(
          `image-audit: ${p.handle ?? p.id} ${prev ?? "—"} → ${next}${
            classification.broken_urls.length
              ? ` (${classification.broken_urls.length} dead url(s))`
              : ""
          }`
        )
      } catch (err: any) {
        summary.errors++
        deps.logger.warn(
          `image-audit: updateProducts failed for ${p.handle ?? p.id}: ${err?.message ?? err}`
        )
      }
    }
    return !(opts.limit && summary.scanned >= opts.limit)
  }

  try {
    if (opts.brandId) {
      const ids = await resolveBrandProductIds(deps, opts.brandId)
      for (let i = 0; i < ids.length; i += PAGE_SIZE) {
        const chunk = ids.slice(i, i + PAGE_SIZE)
        const { data = [] } = await deps.query.graph({
          entity: "product",
          fields,
          filters: { id: chunk },
          pagination: { take: chunk.length, skip: 0 },
        })
        const keepGoing = await processPage((data as ProductRow[]) ?? [])
        if (!keepGoing) break
      }
    } else {
      let skip = 0
      while (true) {
        const { data = [] } = await deps.query.graph({
          entity: "product",
          fields,
          pagination: { take: PAGE_SIZE, skip, order: { created_at: "DESC" } },
        })
        const rows = (data as ProductRow[]) ?? []
        if (!rows.length) break
        const keepGoing = await processPage(rows)
        if (!keepGoing || rows.length < PAGE_SIZE) break
        skip += rows.length
      }
    }
  } catch (err: any) {
    summary.errors++
    deps.logger.warn(`image-audit: scan aborted: ${err?.message ?? err}`)
  }

  summary.finished_at = new Date().toISOString()
  state.in_progress = false
  state.last_run = summary

  deps.logger.info(
    `image-audit: done scanned=${summary.scanned} checked=${summary.checked} broken=${summary.broken_found} cleared=${summary.cleared} updated=${summary.updated} errors=${summary.errors}`
  )
  opts.capture?.("image_audit_completed", {
    ...summary,
    source: opts.source ?? null,
  })

  return summary
}

/**
 * SAFE PRODUCT IMAGE WRITE — the single sanctioned chokepoint for writing
 * `product.images` / `product.thumbnail`.
 *
 * Born from the 2026-06-02 incident where a script wholesale-replaced product
 * images with unvalidated supplier URLs (many 404), wiping/breaking galleries.
 * See "Product images — HARD RULES" in CLAUDE.md.
 *
 * This module makes the three failure modes STRUCTURALLY IMPOSSIBLE, regardless
 * of what the caller intends:
 *   1. You cannot ADD a URL that isn't confirmed live (HTTP 200). Dead/unknown
 *      additions are rejected and dropped.
 *   2. You cannot REMOVE a live image. A current image the caller omits is
 *      force-kept unless it is CONFIRMED dead (404/410) AND the caller passed
 *      `allowRepairRemovals: true`. Transient errors (timeout/5xx/403) never
 *      remove anything.
 *   3. You cannot EMPTY a gallery. If the computed result is empty, the write
 *      is aborted and the existing images are left untouched.
 *
 * So even a careless `writeProductImages(c, id, [oneUrl])` (intending a wholesale
 * replace) can only ADD that url if live — every existing live image is retained.
 * Wiping a working gallery is not expressible through this API.
 *
 * The diff/decision logic is the pure, unit-tested `planImageWrite`. The network
 * validation + DB write live in `writeProductImages`.
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { checkImageUrl } from "../services/image-audit/check"

export type Liveness = "live" | "dead" | "unknown"

/** Comparison key: host + path, lowercased, query stripped. */
export const imageKey = (url: string): string => {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).toLowerCase()
  } catch {
    return url.split("?")[0].toLowerCase()
  }
}

export type ImageWritePlan = {
  final: string[]
  added: string[]
  removed: string[]
  forceKept: string[]
  rejected: { url: string; reason: string }[]
}

/**
 * Pure decision function. Given the current images, the caller's desired final
 * set, and a liveness verdict per image key, compute what may actually be
 * written under the hard rules. Network-free and fully unit-testable.
 */
export function planImageWrite(
  current: string[],
  desired: string[],
  liveness: Map<string, Liveness>,
  opts: { allowRepairRemovals: boolean }
): ImageWritePlan {
  const currentByKey = new Map<string, string>()
  for (const u of current) {
    if (u && !currentByKey.has(imageKey(u))) currentByKey.set(imageKey(u), u)
  }
  const desiredByKey = new Map<string, string>()
  for (const u of desired) {
    if (u && !desiredByKey.has(imageKey(u))) desiredByKey.set(imageKey(u), u)
  }

  const added: string[] = []
  const removed: string[] = []
  const forceKept: string[] = []
  const rejected: { url: string; reason: string }[] = []

  const final: string[] = []
  const finalKeys = new Set<string>()
  const push = (u: string) => {
    const k = imageKey(u)
    if (!finalKeys.has(k)) {
      finalKeys.add(k)
      final.push(u)
    }
  }

  // 1. Reconcile current images, applying REMOVAL PROTECTION.
  for (const [k, u] of currentByKey) {
    if (desiredByKey.has(k)) {
      push(u) // caller keeps it
      continue
    }
    // Caller wants to drop this current image.
    const status = liveness.get(k) ?? "unknown"
    if (opts.allowRepairRemovals && status === "dead") {
      removed.push(u) // only a confirmed-dead image may be removed, only in repair mode
    } else {
      push(u) // PROTECT — never drop a live or unverified image
      forceKept.push(u)
    }
  }

  // 2. ADDITIONS — only confirmed-live, not already present.
  for (const [k, u] of desiredByKey) {
    if (currentByKey.has(k)) continue
    const status = liveness.get(k) ?? "unknown"
    if (status === "live") {
      push(u)
      added.push(u)
    } else {
      rejected.push({ url: u, reason: status === "dead" ? "dead (404/410)" : "unverified" })
    }
  }

  return { final, added, removed, forceKept, rejected }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

const fileNameUpper = (url: string): string => {
  try {
    return (new URL(url).pathname.split("/").pop() ?? "").toUpperCase()
  } catch {
    return url.toUpperCase()
  }
}

// Prefer a MAIN/FRONT studio shot for the thumbnail; avoid THUMB and BACK.
const scoreThumb = (url: string): number => {
  const f = fileNameUpper(url)
  if (f.includes("THUMB")) return -2
  if (f.includes("_BACK")) return -1
  if (f.includes("MAIN")) return 3
  if (f.includes("FRONT")) return 2
  return 0
}

export type WriteImagesResult = ImageWritePlan & {
  productId: string
  before: number
  after: number
  thumbnail: string | null
  wrote: boolean
  abortReason?: string
}

/**
 * The enforced write path. Validates additions and removal-candidates over the
 * network (reusing image-audit's checkImageUrl), runs `planImageWrite`, refuses
 * to empty the gallery, picks a live thumbnail, and writes via the product
 * module. Pass `dryRun` to compute without writing.
 *
 * @param desiredUrls  the FULL intended final image list (not a delta).
 */
export async function writeProductImages(
  container: any,
  productId: string,
  desiredUrls: string[],
  opts: {
    thumbnail?: string
    allowRepairRemovals?: boolean
    currentUrls?: string[]
    knownLiveness?: Map<string, Liveness>
    timeoutMs?: number
    concurrency?: number
    dryRun?: boolean
    logger?: { info: (m: string) => void; warn: (m: string) => void }
  } = {}
): Promise<WriteImagesResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const timeoutMs = opts.timeoutMs ?? 12000
  const concurrency = opts.concurrency ?? 8
  const allowRepairRemovals = opts.allowRepairRemovals ?? false

  // Load current images/thumbnail unless supplied.
  let currentUrls = opts.currentUrls
  let currentThumb: string | null = null
  {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "thumbnail", "images.url"],
      filters: { id: productId },
    })
    const p = (data ?? [])[0]
    if (!currentUrls) currentUrls = ((p?.images ?? []) as any[]).map((i) => i.url).filter(Boolean)
    currentThumb = p?.thumbnail ?? null
  }
  currentUrls = currentUrls ?? []

  // Work out which keys we must validate: additions (not currently present) and
  // removal-candidates (currently present, omitted from desired). Unchanged
  // images are not re-validated.
  const currentKeys = new Set(currentUrls.map(imageKey))
  const desiredKeys = new Set(desiredUrls.map(imageKey))
  const toCheck = new Map<string, string>()
  for (const u of desiredUrls) if (!currentKeys.has(imageKey(u))) toCheck.set(imageKey(u), u)
  for (const u of currentUrls) if (!desiredKeys.has(imageKey(u))) toCheck.set(imageKey(u), u)

  const liveness = new Map<string, Liveness>(opts.knownLiveness ?? [])
  const pending = [...toCheck.entries()].filter(([k]) => !liveness.has(k))
  await mapPool(pending, concurrency, async ([k, url]) => {
    const res = await checkImageUrl(url, timeoutMs)
    liveness.set(k, res.ok ? "live" : res.status === 404 || res.status === 410 ? "dead" : "unknown")
  })

  const plan = planImageWrite(currentUrls, desiredUrls, liveness, { allowRepairRemovals })

  const result: WriteImagesResult = {
    productId,
    before: currentUrls.length,
    after: plan.final.length,
    thumbnail: null,
    wrote: false,
    ...plan,
  }

  // RULE 3 — never empty a gallery.
  if (plan.final.length === 0) {
    result.abortReason = "would empty gallery"
    opts.logger?.warn(`safe-images ${productId}: refusing write — would empty gallery (kept ${currentUrls.length} existing)`)
    return result
  }

  // Choose a thumbnail that is in `final`. Prefer the caller's, then the existing
  // one if retained, then the best-scoring final image.
  const finalKeys = new Set(plan.final.map(imageKey))
  let thumbnail: string | undefined
  if (opts.thumbnail && finalKeys.has(imageKey(opts.thumbnail))) thumbnail = opts.thumbnail
  else if (currentThumb && finalKeys.has(imageKey(currentThumb))) thumbnail = currentThumb
  else thumbnail = [...plan.final].sort((a, b) => scoreThumb(b) - scoreThumb(a))[0]
  result.thumbnail = thumbnail ?? null

  // No-op if nothing actually changed.
  const sameSet =
    currentKeys.size === finalKeys.size && [...finalKeys].every((k) => currentKeys.has(k))
  const sameThumb = !thumbnail || imageKey(thumbnail) === imageKey(currentThumb ?? "")
  if (sameSet && sameThumb) {
    opts.logger?.info(`safe-images ${productId}: no change (${currentUrls.length} images)`)
    return result
  }

  if (opts.dryRun) {
    opts.logger?.info(
      `safe-images ${productId} (dry-run): +${plan.added.length} added, -${plan.removed.length} removed, ${plan.forceKept.length} force-kept, ${plan.rejected.length} rejected → ${plan.final.length} images`
    )
    return result
  }

  await productModule.updateProducts(productId, {
    thumbnail,
    images: plan.final.map((url) => ({ url })),
  })
  result.wrote = true
  opts.logger?.info(
    `safe-images ${productId}: +${plan.added.length} added, -${plan.removed.length} removed (confirmed-dead), ${plan.forceKept.length} protected, ${plan.rejected.length} rejected → ${plan.final.length} images`
  )
  return result
}

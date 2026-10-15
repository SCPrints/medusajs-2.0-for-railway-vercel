import { Modules } from "@medusajs/framework/utils"

/**
 * Lookbook "jobs": a tile is ONE photo, a job is every published tile that
 * shares a `job_slug` (e.g. Naked Baker = 9 photos, 1 job). Jobs power the
 * per-job SEO pages, the PDP "Real jobs on this garment" strip and the
 * industry-page strips.
 */

import { LOOKBOOK_INDUSTRY_TAGS, slugifyJob } from "./lookbook-job-slug"

export { LOOKBOOK_INDUSTRY_TAGS, slugifyJob }

export type LookbookRow = {
  id: string
  title: string
  description: string | null
  image_url: string
  attribution: string | null
  job_slug: string | null
  product_handles: { handles?: string[] } | null
  tags: { values?: string[] } | null
  updated_at?: Date | string | null
}

export type LookbookJob = {
  slug: string
  title: string
  description: string | null
  cover_image_url: string
  image_count: number
  tags: string[]
  /** Union across the job's tiles, first-seen order — a link on any photo counts for the whole job. */
  product_handles: string[]
  updated_at: string | null
  tiles: LookbookRow[]
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

/**
 * Group rows (already sorted weight ASC, id ASC) into jobs. Job order = order of
 * its first tile, so the cover photo is the staff's top-weighted shot. A row
 * with no slug is its own job, keyed by id.
 */
export function groupLookbookJobs(rows: LookbookRow[]): LookbookJob[] {
  const bySlug = new Map<string, LookbookRow[]>()
  for (const r of rows) {
    const slug = r.job_slug || r.id
    const list = bySlug.get(slug)
    if (list) list.push(r)
    else bySlug.set(slug, [r])
  }
  return Array.from(bySlug, ([slug, tiles]) => {
    const times = tiles
      .map((t) => (t.updated_at ? new Date(t.updated_at).getTime() : 0))
      .filter((n) => n > 0)
    return {
      slug,
      title: tiles[0].title,
      description: tiles.find((t) => t.description?.trim())?.description ?? null,
      cover_image_url: tiles[0].image_url,
      image_count: tiles.length,
      tags: uniq(tiles.flatMap((t) => t.tags?.values ?? []).filter(Boolean)),
      product_handles: uniq(
        tiles.flatMap((t) => t.product_handles?.handles ?? []).filter(Boolean)
      ),
      updated_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
      tiles,
    }
  })
}

/** Jobs matching a product handle and/or tag (tag compare is case-insensitive). */
export function filterLookbookJobs(
  jobs: LookbookJob[],
  { productHandle, tag }: { productHandle?: string; tag?: string }
): LookbookJob[] {
  const t = tag?.trim().toLowerCase()
  return jobs.filter(
    (j) =>
      (!productHandle || j.product_handles.includes(productHandle)) &&
      (!t || j.tags.some((x) => x.toLowerCase() === t))
  )
}

/** Other jobs, those sharing a tag or garment first, then the rest in weight order. */
export function relatedLookbookJobs(
  job: LookbookJob,
  all: LookbookJob[],
  limit = 4
): LookbookJob[] {
  const others = all.filter((j) => j.slug !== job.slug)
  const overlaps = (j: LookbookJob) =>
    j.tags.some((t) => job.tags.includes(t)) ||
    j.product_handles.some((h) => job.product_handles.includes(h))
  return [...others.filter(overlaps), ...others.filter((j) => !overlaps(j))].slice(
    0,
    limit
  )
}

export type ResolvedLookbookProduct = {
  handle: string
  title: string
  thumbnail: string | null
}

/** Batch-resolve handles → published product summaries; misses are dropped. */
export async function resolveLookbookProducts(
  scope: { resolve: (k: string) => unknown },
  handles: string[]
): Promise<Map<string, ResolvedLookbookProduct>> {
  const out = new Map<string, ResolvedLookbookProduct>()
  const unique = uniq(handles.filter(Boolean))
  if (!unique.length) return out
  try {
    const productService = scope.resolve(Modules.PRODUCT) as any
    const products = await productService.listProducts(
      { handle: unique, status: "published" },
      { select: ["handle", "title", "thumbnail"], take: unique.length }
    )
    for (const p of products as any[]) {
      out.set(p.handle, { handle: p.handle, title: p.title, thumbnail: p.thumbnail ?? null })
    }
  } catch {
    // Best-effort — a product-module hiccup just means no garment links.
  }
  return out
}

/** Public shape of a job (no raw tiles). */
export const toPublicJob = (j: LookbookJob) => ({
  slug: j.slug,
  title: j.title,
  description: j.description,
  cover_image_url: j.cover_image_url,
  image_count: j.image_count,
  tags: j.tags,
  updated_at: j.updated_at,
})

/**
 * Every published tile grouped into jobs.
 * ponytail: loads all published rows (132 today) and groups in memory; move
 * to a SQL GROUP BY on job_slug if the lookbook grows past a few thousand.
 */
export async function loadPublishedJobs(scope: {
  resolve: (k: string) => unknown
}): Promise<LookbookJob[]> {
  const service = scope.resolve("lookbook") as {
    listLookbookItems: (f: object, c: object) => Promise<unknown[]>
  }
  const rows = await service.listLookbookItems(
    { is_published: true },
    { order: { weight: "ASC", id: "ASC" }, take: 5000 }
  )
  return groupLookbookJobs(rows as LookbookRow[])
}

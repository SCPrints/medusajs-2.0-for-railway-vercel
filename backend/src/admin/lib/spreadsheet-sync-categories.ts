/**
 * Resolves CSV-supplied category paths (e.g. ["Hospitality", "Chefs & Waiters Jackets"])
 * into Medusa product-category IDs. Auto-creates missing levels with the correct parent chain.
 *
 * Kept SDK-agnostic via a minimal interface so the resolution logic stays unit-testable.
 */

export type CategoryRecord = {
  id: string
  name: string
  handle: string
  parent_category_id: string | null
}

export type CategoryClient = {
  list(query: { limit?: number; offset?: number; fields?: string }): Promise<{
    product_categories: CategoryRecord[]
    count: number
    limit: number
    offset: number
  }>
  create(body: {
    name: string
    handle?: string
    parent_category_id?: string | null
    is_active?: boolean
  }): Promise<{ product_category: CategoryRecord }>
}

/** URL-safe handle from a category-segment label. Mirrors `slugifyCollectionHandle` semantics. */
export function slugifyCategoryHandle(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return s || "category"
}

/** Stable key for a path so callers can dedupe / look up after resolution. */
export function categoryPathKey(segments: string[]): string {
  return segments.map((s) => s.trim().toLowerCase()).join(" > ")
}

/** Pull every category from Medusa, paging through `list`. Stops once `count` is exhausted. */
async function fetchAllCategories(client: CategoryClient): Promise<CategoryRecord[]> {
  const PAGE = 200
  const all: CategoryRecord[] = []
  let offset = 0
  while (true) {
    const resp = await client.list({
      limit: PAGE,
      offset,
      fields: "id,name,handle,parent_category_id",
    })
    all.push(...resp.product_categories)
    offset += resp.product_categories.length
    if (resp.product_categories.length < PAGE || offset >= resp.count) {
      break
    }
  }
  return all
}

type ResolveCategoryPathsResult = {
  /** Path-key → leaf category id. Use [categoryPathKey](#categoryPathKey) to build the key from segments. */
  idByPathKey: Map<string, string>
  /** Human-readable log lines describing newly-created categories (for the page's sync log). */
  createdLog: string[]
}

/**
 * Walk every requested path; for each segment, find an existing category at that level (matched by
 * normalised name OR handle, scoped to the same parent) or create a new one. Returns a map from
 * each input path-key to the resolved leaf category id.
 *
 * Scoping rule: a category is considered the same as another if they share normalised handle (slug
 * of the segment label) AND the same `parent_category_id`. So "Apparel > Tops" and "Workwear > Tops"
 * end up as two distinct "Tops" categories — which matches Medusa admin UX.
 */
export async function resolveCategoryPaths(
  client: CategoryClient,
  paths: string[][]
): Promise<ResolveCategoryPathsResult> {
  const createdLog: string[] = []
  const idByPathKey = new Map<string, string>()
  if (!paths.length) {
    return { idByPathKey, createdLog }
  }

  const existing = await fetchAllCategories(client)

  /** Index existing by `${parent_category_id ?? "ROOT"}/${handle}` → record. */
  const byParentAndHandle = new Map<string, CategoryRecord>()
  /** Secondary index by `${parent_category_id}/${normalised name}` to catch hand-renamed handles. */
  const byParentAndName = new Map<string, CategoryRecord>()
  for (const c of existing) {
    const parentKey = c.parent_category_id ?? "ROOT"
    byParentAndHandle.set(`${parentKey}/${c.handle.toLowerCase()}`, c)
    byParentAndName.set(`${parentKey}/${c.name.trim().toLowerCase()}`, c)
  }

  const lookup = (parentId: string | null, segment: string): CategoryRecord | undefined => {
    const parentKey = parentId ?? "ROOT"
    const handle = slugifyCategoryHandle(segment)
    return (
      byParentAndHandle.get(`${parentKey}/${handle}`) ??
      byParentAndName.get(`${parentKey}/${segment.trim().toLowerCase()}`)
    )
  }

  for (const segments of paths) {
    if (!segments.length) {
      continue
    }
    let parentId: string | null = null
    let leaf: CategoryRecord | null = null

    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed) {
        continue
      }
      let cat = lookup(parentId, trimmed)
      if (!cat) {
        const handle = slugifyCategoryHandle(trimmed)
        const created = await client.create({
          name: trimmed,
          handle,
          parent_category_id: parentId,
          is_active: true,
        })
        cat = created.product_category
        const parentKey = parentId ?? "ROOT"
        byParentAndHandle.set(`${parentKey}/${cat.handle.toLowerCase()}`, cat)
        byParentAndName.set(`${parentKey}/${cat.name.trim().toLowerCase()}`, cat)
        createdLog.push(
          `  Created category "${trimmed}" (${cat.id}${parentId ? `, parent=${parentId}` : ", root"}).`
        )
      }
      parentId = cat.id
      leaf = cat
    }

    if (leaf) {
      idByPathKey.set(categoryPathKey(segments), leaf.id)
    }
  }

  return { idByPathKey, createdLog }
}

/**
 * Apply the resolution map to a list of product-create payloads, attaching `category_ids` per handle.
 * Mutates each payload in place; safe to call with an empty map (no-op).
 */
export function applyCategoryIdsToCreates(
  creates: Array<Record<string, unknown> & { handle?: string }>,
  pathsByHandle: Map<string, string[][]>,
  idByPathKey: Map<string, string>
): void {
  if (!pathsByHandle.size || !idByPathKey.size) {
    return
  }
  for (const payload of creates) {
    const h = payload.handle
    if (!h) {
      continue
    }
    const paths = pathsByHandle.get(h)
    if (!paths || !paths.length) {
      continue
    }
    const ids: string[] = []
    const seen = new Set<string>()
    for (const segs of paths) {
      const id = idByPathKey.get(categoryPathKey(segs))
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    if (ids.length) {
      payload.categories = ids.map((id) => ({ id }))
    }
  }
}

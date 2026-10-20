import type { FashionBizBrandSlug } from "../modules/fashionbiz/types"

/**
 * Which (brand, slug, colour) groups the FashionBiz stock sweep must call
 * `/stock` for, and the SKUs each one covers (review 2-6).
 *
 * The sync used to page the ENTIRE product_variant table (62k rows, jsonb
 * metadata + joined product.metadata, no ORDER BY) and keep the 11k
 * FashionBiz rows in JS. The importer's handle is always
 * `${brand}-${slug}` (mapping.ts `handleForProduct`), so one `$like`
 * query per brand scopes the read to those products, with only the two
 * variant fields the grouping needs and a stable `id ASC` order so a
 * product created mid-walk can't shift a page under us.
 */

export const FASHIONBIZ_BRAND_SLUGS: readonly FashionBizBrandSlug[] = [
  "biz-collection",
  "biz-care",
  "biz-corporates",
  "syzmik",
  "good-mates",
]

export type FashionBizStockGroup = {
  brand: FashionBizBrandSlug
  slug: string
  colour: string
  skus: Set<string>
}

type GraphLike = {
  graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }>
}

type ProductRow = {
  id?: string
  variants?: Array<{
    sku?: string | null
    metadata?: { fashionbiz?: { product_slug?: string; color_name?: string } } | null
  }> | null
}

export async function loadFashionBizStockGroups(
  query: GraphLike,
  opts: { pageSize?: number } = {}
): Promise<{ groups: Map<string, FashionBizStockGroup>; variantCount: number }> {
  const pageSize = opts.pageSize ?? 200
  const groups = new Map<string, FashionBizStockGroup>()
  let variantCount = 0

  for (const brand of FASHIONBIZ_BRAND_SLUGS) {
    let offset = 0
    while (true) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "variants.sku", "variants.metadata"],
        filters: { handle: { $like: `${brand}-%` } },
        pagination: { take: pageSize, skip: offset, order: { id: "ASC" } },
      })
      const page = (data ?? []) as ProductRow[]
      if (!page.length) break

      for (const product of page) {
        for (const v of product.variants ?? []) {
          const slug = v?.metadata?.fashionbiz?.product_slug
          const colour = v?.metadata?.fashionbiz?.color_name
          if (!slug || !colour || !v.sku) continue
          variantCount++
          const key = `${brand}|${slug}|${colour}`
          let group = groups.get(key)
          if (!group) {
            group = { brand, slug, colour, skus: new Set() }
            groups.set(key, group)
          }
          group.skus.add(v.sku)
        }
      }

      if (page.length < pageSize) break
      offset += page.length
    }
  }

  return { groups, variantCount }
}

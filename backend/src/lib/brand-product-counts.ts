/**
 * Published, non-deleted products per brand, via the Product↔Brand link table.
 * Drafts don't count: a brand whose products all went back to draft (the
 * nightly supplier sync can do that) must read as empty on the storefront.
 */
export async function countPublishedProductsByBrand(
  pgConnection: any,
  brandIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(brandIds.map((id) => [id, 0]))
  if (brandIds.length === 0) return counts
  const rows: Array<{ brand_id: string; count: string | number }> = await pgConnection(
    "product_product_brand_brand as l"
  )
    .join("product as p", "p.id", "l.product_id")
    .whereIn("l.brand_id", brandIds)
    .whereNull("l.deleted_at")
    .whereNull("p.deleted_at")
    .where("p.status", "published")
    .groupBy("l.brand_id")
    .select("l.brand_id as brand_id")
    .count("l.product_id as count")
  for (const r of rows) counts[r.brand_id] = Number(r.count) || 0
  return counts
}

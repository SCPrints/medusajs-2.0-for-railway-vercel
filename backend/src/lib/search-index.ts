import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * The Meilisearch index currently serving reads for a logical Search Module
 * index (e.g. "products" → "products_v3").
 *
 * Medusa's Search Module builds every version under its own name and swaps the
 * active one in Postgres, so anything that queries Meili directly (storefront,
 * Job pricer, health check) must ask which version is live. Falls back to the
 * bare name when the module has no active version yet. Readers may lag a swap
 * by the cache TTL: the module keeps the previous version until the next build.
 */
const TTL_MS = 30_000
const cache = new Map<string, { value: string; at: number }>()

export async function activeSearchIndexName(scope: { resolve: (key: string) => any }, name: string): Promise<string> {
  const hit = cache.get(name)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  let value = name
  try {
    const pg = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const row = await pg("search_index as i")
      .join("search_index_version as v", function (this: any) {
        this.on("v.search_index_id", "=", "i.id").andOn("v.version", "=", "i.active_version")
      })
      .whereNull("i.deleted_at")
      .whereNull("v.deleted_at")
      .where("i.name", name)
      .first("v.physical_name")
    if (row?.physical_name) value = row.physical_name
  } catch {
    // ponytail: no Search Module tables yet (pre-2.21 schema) → bare name.
  }
  cache.set(name, { value, at: Date.now() })
  return value
}

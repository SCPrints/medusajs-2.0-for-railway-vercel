import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Full rebuild of the Meilisearch `products` index via Medusa's Search Module.
 *
 * Builds a fresh version (`products_vN`) from the published catalog, catches up
 * on anything that changed meanwhile, then swaps it in. The live version keeps
 * serving until the swap, and a failed rebuild leaves it untouched — so a
 * truncated catalog query can no longer gut the live index (the June 2026
 * incident the old orphan-sweep guard existed for).
 *
 * Use after a Meilisearch redeploy that wiped data, or to force fresh documents.
 * A changed index declaration (src/search/products.ts) does not need this:
 * db:migrate + boot rebuild it automatically.
 *
 * Local:  cd backend && npx medusa exec ./src/scripts/reindex-meilisearch.ts
 * Fly:    cd /app/.medusa/server && npx medusa exec ./src/scripts/reindex-meilisearch.js
 */
export default async function reindexMeilisearch({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const search = container.resolve(Modules.SEARCH) as any
  const result = await search.reindex({ index: "products", strategy: "swap" })
  logger.info(`[reindex-meilisearch] done: ${JSON.stringify(result)}`)
}

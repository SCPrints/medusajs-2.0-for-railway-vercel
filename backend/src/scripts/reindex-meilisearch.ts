import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  SearchUtils,
} from "@medusajs/framework/utils"

const MEILISEARCH_MODULE = "meilisearch"

type SyncResult = { processed: number; deleted: number }

/**
 * One-shot reindex of all published products + active categories into
 * Meilisearch. Mirrors what the plugin's bundled `meilisearch.sync`
 * subscriber does (admin POST /admin/meilisearch/sync), but blocks until
 * both syncs finish so the script's exit code reflects success/failure.
 *
 * Use after:
 *   - a Meilisearch redeploy that wiped the index
 *   - a catalog import that ran while the plugin's subscriber was down
 *   - a schema change to the plugin's `fields` / `searchableAttributes`
 *
 * Local:
 *   cd backend && npx medusa exec ./src/scripts/reindex-meilisearch.ts
 *
 * Fly:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec ./src/scripts/reindex-meilisearch.js
 *
 * Env knobs:
 *   REINDEX_BATCH_SIZE=200    products fetched + pushed per page (default 200)
 *   REINDEX_SKIP_ORPHANS=1    skip the index sweep that deletes stale docs
 *   REINDEX_SKIP_CATEGORIES=1 only reindex products
 *   REINDEX_SKIP_PRODUCTS=1   only reindex categories
 */
export default async function reindexMeilisearch({ container }: ExecArgs) {
  const logger = container.resolve("logger")

  let meili: any
  try {
    meili = container.resolve(MEILISEARCH_MODULE)
  } catch {
    logger.warn(
      "[reindex-meilisearch] Meilisearch module not registered — set MEILISEARCH_HOST + MEILISEARCH_ADMIN_KEY and restart. Skipping."
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const batchSize = Math.max(1, Number(process.env.REINDEX_BATCH_SIZE) || 200)
  const skipOrphans = process.env.REINDEX_SKIP_ORPHANS === "1"
  const skipCategories = process.env.REINDEX_SKIP_CATEGORIES === "1"
  const skipProducts = process.env.REINDEX_SKIP_PRODUCTS === "1"

  async function syncType(
    label: string,
    type: string,
    entity: string,
    filters: Record<string, unknown>
  ): Promise<SyncResult> {
    const fields: string[] = await meili.getFieldsForType(type)
    const indexes: string[] = await meili.getIndexesByType(type)

    if (indexes.length === 0) {
      logger.info(
        `[reindex-meilisearch] ${label}: no indexes configured for type "${type}", skipping`
      )
      return { processed: 0, deleted: 0 }
    }

    logger.info(
      `[reindex-meilisearch] ${label}: starting (batch=${batchSize}, indexes=${indexes.join(",")})`
    )

    const seenIds: string[] = []
    let offset = 0

    while (true) {
      const { data } = await query.graph({
        entity,
        fields,
        pagination: { take: batchSize, skip: offset },
        filters,
      })
      if (data.length === 0) break

      await Promise.all(
        indexes.map((idx) => meili.addDocuments(idx, data))
      )
      for (const row of data as Array<{ id: string }>) seenIds.push(row.id)

      logger.info(
        `[reindex-meilisearch] ${label}: pushed ${seenIds.length} so far`
      )

      offset += batchSize
      if (data.length < batchSize) break
    }

    let deleted = 0
    if (!skipOrphans && seenIds.length > 0) {
      const validIds = new Set(seenIds)

      for (const idx of indexes) {
        const orphanIds: string[] = []
        let indexedSeen = 0
        let sweepPage = 1

        while (true) {
          // hitsPerPage/page (NOT offset/limit) puts Meili in exhaustive
          // pagination mode. offset/limit is capped by maxTotalHits
          // (default 1000), which silently ended the sweep early on a
          // 1500+ doc index — ~200 stale docs survived every reindex and
          // ghost (unsellable) products kept surfacing at the top of
          // newest-first listings. Found 2026-06-10.
          const result = await meili.search(idx, "", {
            attributesToRetrieve: ["id"],
            paginationOptions: { hitsPerPage: batchSize, page: sweepPage },
          })
          if (result.hits.length === 0) break

          for (const hit of result.hits as Array<{ id: string }>) {
            indexedSeen++
            if (!validIds.has(hit.id)) orphanIds.push(hit.id)
          }

          sweepPage += 1
          if (result.hits.length < batchSize) break
        }

        // Anti-gutting guard (2026-06-18 incident). The orphan sweep deletes
        // every indexed doc we did NOT just push. If the add-phase graph query
        // truncated (timeout under DB load), `validIds` is tiny and `orphanIds`
        // is mostly REAL products — deleting them silently drained the prod
        // index 1352 -> ~105 over several days. Refuse to delete when the
        // fetched set is implausibly small vs what's already indexed; skip +
        // log loudly so a human reruns rather than lose the index. The same
        // guard lives in the meilisearch plugin's syncProductsStep patch.
        if (
          orphanIds.length > 0 &&
          (validIds.size < 10 ||
            (indexedSeen > 0 && validIds.size < indexedSeen * 0.5))
        ) {
          logger.error(
            `[reindex-meilisearch] ${label}: ABORTING orphan deletion on "${idx}" — only ${validIds.size} valid docs fetched but the index holds ~${indexedSeen}; would have deleted ${orphanIds.length}. The source query likely truncated; refusing to gut the index. Re-run when the DB is quiet if the drift is real.`
          )
          continue
        }

        for (let i = 0; i < orphanIds.length; i += batchSize) {
          await meili.deleteDocuments(idx, orphanIds.slice(i, i + batchSize))
        }
        deleted += orphanIds.length
      }
    }

    logger.info(
      `[reindex-meilisearch] ${label}: done — pushed ${seenIds.length}, deleted ${deleted} orphans`
    )
    return { processed: seenIds.length, deleted }
  }

  if (!skipCategories) {
    await syncType("categories", "categories", "product_category", {
      is_active: true,
    })
  }

  if (!skipProducts) {
    await syncType(
      "products",
      SearchUtils.indexTypes.PRODUCTS,
      "product",
      { status: "published" }
    )
  }
}

/**
 * One-off: re-run Shop-category assignment for the Thread Lab products.
 *
 * The initial import (import-thread-lab.ts) left 3 products "untyped" for
 * Shop categories — Quarter Zip, Jogger, Shorts — because their canonical
 * product_type strings ("Quarter Zips", "Track Pants", "Casual Shorts")
 * weren't keys in `TYPE_TO_SUB_HANDLE` (shop-categories.ts). That map has
 * since gained the multi-word canonical keys, so this script re-runs the
 * (idempotent) category assignment to back-fill the stragglers.
 *
 * Safe to re-run: assignCategoriesToProducts only writes products whose
 * category set actually changes; everything else is skipped.
 *
 * Usage:
 *   pnpm --filter backend medusa exec src/scripts/recategorize-thread-lab.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { applyShopCategoriesToProducts } from "../lib/supplier-import-pipeline"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"
import { THREAD_LAB_CATALOG } from "./thread-lab-catalog"

export default async function recategorizeThreadLab({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const handles = THREAD_LAB_CATALOG.map((s) => s.handle)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title"],
    filters: { handle: handles },
  })

  if (!products?.length) {
    logger.info("No Thread Lab products found — nothing to re-categorize.")
    return
  }

  logger.info(`Re-categorizing ${products.length} Thread Lab product(s)…`)
  const summary = await applyShopCategoriesToProducts(
    container,
    products as Array<{ id: string; handle: string; title?: string }>,
    logger
  )
  logger.info(`Done. ${JSON.stringify(summary)}`)

  // Bust the mega-menu category caches so the newly-assigned subs surface.
  await revalidateStorefrontTags(["categories"], logger)
}

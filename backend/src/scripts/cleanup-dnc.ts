/**
 * Removes ONLY products imported from DNC (those with metadata.external_id starting with "dnc-").
 * Does not touch your AS Colour or other supplier products.
 *
 * Run: npx medusa exec ./src/scripts/cleanup-dnc.ts
 *
 * Use this if a test import produces bad data and you want a clean slate
 * before re-running import-dnc.ts.
 *
 * Does NOT delete: types, tags, categories, or the supplier collection.
 * Those are safe to keep — re-running the import will reuse them.
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

export default async function cleanupDnc({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productService = container.resolve(Modules.PRODUCT)

  // Find all DNC products. We can't filter inside JSON metadata directly via
  // query.graph in a portable way, so fetch all and filter in memory.
  // For small catalogues (< 5000) this is fine.
  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata"],
  })

  const dncProducts = (allProducts || []).filter((p) => {
    const ext = (p.metadata as any)?.external_id
    return typeof ext === "string" && ext.startsWith("dnc-")
  })

  logger.info(`Found ${dncProducts.length} DNC products to delete`)

  if (!dncProducts.length) {
    logger.info("Nothing to clean up.")
    return
  }

  // Delete in chunks to avoid huge transactions
  const CHUNK = 50
  for (let i = 0; i < dncProducts.length; i += CHUNK) {
    const ids = dncProducts.slice(i, i + CHUNK).map((p) => p.id)
    await productService.deleteProducts(ids)
    logger.info(`Deleted ${Math.min(i + CHUNK, dncProducts.length)}/${dncProducts.length}`)
  }

  logger.info("DNC cleanup complete.")
}

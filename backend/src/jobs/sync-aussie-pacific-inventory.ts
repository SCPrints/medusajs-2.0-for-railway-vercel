import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { AUSSIEPACIFIC_MODULE } from "../modules/aussiepacific"
import AussiePacificService from "../modules/aussiepacific/service"
import { normalizeStockLevel, toArray } from "../modules/aussiepacific/mapping"
import type { AussiePacificVariant } from "../modules/aussiepacific/types"
import { writeInventoryLevels } from "../lib/inventory-level-writes"
import { withJobContext, getContextLogger } from "../lib/job-context-wrapper"
import { withSupplierLock } from "../lib/supplier-sync-lock"

const AUSSIEPACIFIC_LOCATION_NAME = "Aussie Pacific Warehouse"
const CHECKPOINT_KEY = "aussiepacific:inventory:lastSync"

/**
 * Daily sweep of Aussie Pacific stock into the Aussie Pacific Medusa
 * stock location.
 *
 * Aussie Pacific's API exposes no `updated_at` filter — stock is embedded
 * on variants inside `/api/v1/products`. We walk every page (with
 * `include=variants`) and build a `Map<sku, stock_level>` across the
 * whole catalog. One pass per day at 05:00 UTC (an hour after FashionBiz).
 * Under the `supplier-sync:aussiepacific` lock, shared with the admin
 * import route.
 */
const handler = (container: MedusaContainer) =>
  withSupplierLock(container, "aussiepacific", () =>
    syncAussiePacificInventory(container)
  )

async function syncAussiePacificInventory(container: MedusaContainer) {
  const logger = getContextLogger(container)

  let ap: AussiePacificService
  try {
    ap = container.resolve(AUSSIEPACIFIC_MODULE) as AussiePacificService
  } catch {
    logger.warn(
      "Aussie Pacific module not registered — skipping inventory sync."
    )
    return
  }

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const locations = await stockLocationService.listStockLocations({
    name: AUSSIEPACIFIC_LOCATION_NAME,
  })
  if (!locations.length) {
    logger.warn(
      `Stock location "${AUSSIEPACIFIC_LOCATION_NAME}" not found — run import-aussie-pacific-from-api first.`
    )
    return
  }
  const locationId = locations[0].id

  const startedAt = new Date()
  logger.info("Aussie Pacific inventory sync starting…")

  // 1. Fetch entire AP catalog with embedded variants + stock.
  let products: Awaited<ReturnType<AussiePacificService["fetchAllProducts"]>>
  try {
    products = await ap.fetchAllProducts()
  } catch (err: any) {
    logger.error(
      `Aussie Pacific catalog fetch failed: ${err?.message ?? err} — leaving inventory untouched.`
    )
    return
  }

  // 2. Build sku -> qty map.
  const stockBySku = new Map<string, number>()
  for (const product of products) {
    for (const v of toArray<AussiePacificVariant>(product.variants)) {
      if (!v?.sku) continue
      stockBySku.set(v.sku, normalizeStockLevel(v.stock_level))
    }
  }

  if (!stockBySku.size) {
    logger.warn("No stock data in AP response. Leaving inventory untouched.")
    await writeCheckpoint(container, startedAt.toISOString())
    return
  }

  // 3. Change-only, chunked, sanity-guarded write (lib/inventory-level-writes).
  //    A renamed `stock_level` field (→ NaN → 0 for ~8k variants) is refused here.
  const result = await writeInventoryLevels(container, { stockBySku, locationId, logger })
  if (result.aborted) {
    logger.warn(
      `Aussie Pacific inventory sync ABORTED (checkpoint not advanced): ${result.reason}`
    )
    return
  }

  await writeCheckpoint(container, startedAt.toISOString())
  logger.info(
    `Aussie Pacific inventory sync done — SKUs synced: ${stockBySku.size}, levels created: ${result.created}, updated: ${result.updated}, unchanged: ${result.unchanged}.`
  )
}

async function writeCheckpoint(container: MedusaContainer, value: string) {
  try {
    const cache = container.resolve(Modules.CACHE) as any
    await cache.set(CHECKPOINT_KEY, value)
  } catch {
    // Cache module not available — checkpoint is monitoring-only, safe to skip.
  }
}

export default withJobContext(handler)

export const config = {
  name: "sync-aussie-pacific-inventory",
  schedule: "0 5 * * *", // daily at 05:00 UTC (an hour after FashionBiz)
}

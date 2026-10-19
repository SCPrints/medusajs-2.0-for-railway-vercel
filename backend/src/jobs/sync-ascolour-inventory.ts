import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { writeInventoryLevels } from "../lib/inventory-level-writes"
import { withJobContext, getContextLogger } from "../lib/job-context-wrapper"
import { withSupplierLock } from "../lib/supplier-sync-lock"

const AS_COLOUR_LOCATION_NAME = "AS Colour Warehouse"
const CHECKPOINT_KEY = "ascolour:inventory:lastSync"

/**
 * Daily delta sync of AS Colour stock levels into the AS Colour Medusa stock location.
 * Uses /inventory/items?updatedAt:min=<lastSync> so payloads stay small.
 *
 * Falls back to a full sync the first time it runs (no checkpoint yet).
 * Runs under the `supplier-sync:ascolour` lock — shared with the admin
 * import route and the variant backfill cron.
 */
const handler = (container: MedusaContainer) =>
  withSupplierLock(container, "ascolour", () => syncAsColourInventory(container))

async function syncAsColourInventory(container: MedusaContainer) {
  const logger = getContextLogger(container)

  let ascolour: AsColourService
  try {
    ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService
  } catch {
    logger.warn("AS Colour module not registered — skipping inventory sync.")
    return
  }

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const locations = await stockLocationService.listStockLocations({
    name: AS_COLOUR_LOCATION_NAME,
  })
  if (!locations.length) {
    logger.warn(
      `Stock location "${AS_COLOUR_LOCATION_NAME}" not found — run import-as-colour-from-api first.`
    )
    return
  }
  const locationId = locations[0].id

  const checkpoint = await readCheckpoint(container)
  const startedAt = new Date()
  logger.info(
    `AS Colour inventory sync starting (since ${checkpoint ?? "<no checkpoint, full sync>"})`
  )

  const items = await ascolour.fetchInventoryDelta(checkpoint)
  if (!items.length) {
    logger.info("No AS Colour inventory changes since last sync.")
    await writeCheckpoint(container, startedAt.toISOString())
    return
  }

  // AS Colour's real /inventory/items response is one row per (sku, location)
  // with the qty in `quantity` (not `available`) and no `warehouses` array.
  // Sum across rows so multi-warehouse SKUs aggregate correctly. Fall back
  // to the legacy nested shape if the API ever returns it.
  const stockBySku = new Map<string, number>()
  for (const item of items as any[]) {
    if (!item?.sku) continue
    const qty =
      typeof item.quantity === "number"
        ? item.quantity
        : item.warehouses?.length
          ? item.warehouses.reduce((a: number, w: any) => a + (w.available ?? 0), 0)
          : (item.available ?? 0)
    stockBySku.set(item.sku, (stockBySku.get(item.sku) ?? 0) + qty)
  }

  const skus = Array.from(stockBySku.keys())
  if (!skus.length) {
    await writeCheckpoint(container, startedAt.toISOString())
    return
  }

  // Change-only, chunked, sanity-guarded. On abort NOTHING is written and the
  // checkpoint stays put, so the next run re-fetches the same delta.
  const result = await writeInventoryLevels(container, { stockBySku, locationId, logger })
  if (result.aborted) {
    logger.warn(
      `AS Colour inventory sync ABORTED (checkpoint not advanced): ${result.reason}`
    )
    return
  }

  await writeCheckpoint(container, startedAt.toISOString())
  logger.info(
    `AS Colour inventory sync done — items processed: ${items.length}, levels created: ${result.created}, updated: ${result.updated}, unchanged: ${result.unchanged}.`
  )
}

async function readCheckpoint(container: MedusaContainer): Promise<string | undefined> {
  // Cache module store; key = ascolour:inventory:lastSync. Best-effort — if absent, return undefined.
  try {
    const cache = container.resolve(Modules.CACHE) as any
    const v = await cache.get(CHECKPOINT_KEY)
    return typeof v === "string" ? v : undefined
  } catch {
    return undefined
  }
}

async function writeCheckpoint(container: MedusaContainer, value: string) {
  try {
    const cache = container.resolve(Modules.CACHE) as any
    await cache.set(CHECKPOINT_KEY, value)
  } catch {
    // Cache module not available — sync will fall back to full each run.
  }
}

export default withJobContext(handler)

export const config = {
  name: "sync-ascolour-inventory",
  schedule: "0 3 * * *", // daily at 03:00 UTC (13:00 AEST), ahead of FashionBiz + AP sweeps
}

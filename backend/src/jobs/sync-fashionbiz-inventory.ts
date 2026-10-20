import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { FASHIONBIZ_MODULE } from "../modules/fashionbiz"
import FashionBizService from "../modules/fashionbiz/service"
import { loadFashionBizStockGroups } from "../lib/fashionbiz-stock-groups"
import { writeInventoryLevels } from "../lib/inventory-level-writes"
import { withJobContext, getContextLogger } from "../lib/job-context-wrapper"
import { withSupplierLock } from "../lib/supplier-sync-lock"

const FASHIONBIZ_LOCATION_NAME = "FashionBiz Warehouse"
const CHECKPOINT_KEY = "fashionbiz:inventory:lastSync"
const THROTTLE_MS = 200 // ~5 req/sec — FashionBiz publishes no rate-limit spec

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Daily sweep of FashionBiz stock into the FashionBiz Medusa stock location.
 *
 * FashionBiz exposes no `updated_at` filter on its stock endpoint, so a
 * full sweep is required. We group variants by (brand, slug, colour) and
 * make one /stock call per group, summing across stock locations.
 *
 * Runs at 04:00 UTC = ~14:00–15:00 AEDT — off-peak for both AU customers
 * and (assumed) FashionBiz API capacity. Under the `supplier-sync:fashionbiz`
 * lock, shared with the admin import route.
 */
const handler = (container: MedusaContainer) =>
  withSupplierLock(container, "fashionbiz", () => syncFashionBizInventory(container))

async function syncFashionBizInventory(container: MedusaContainer) {
  const logger = getContextLogger(container)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let fashionbiz: FashionBizService
  try {
    fashionbiz = container.resolve(FASHIONBIZ_MODULE) as FashionBizService
  } catch {
    logger.warn("FashionBiz module not registered — skipping inventory sync.")
    return
  }

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const locations = await stockLocationService.listStockLocations({
    name: FASHIONBIZ_LOCATION_NAME,
  })
  if (!locations.length) {
    logger.warn(
      `Stock location "${FASHIONBIZ_LOCATION_NAME}" not found — run import-fashionbiz-from-api first.`
    )
    return
  }
  const locationId = locations[0].id

  const startedAt = new Date()
  logger.info("FashionBiz inventory sync starting…")

  // 1+2. Find every variant we previously imported and group it by
  //      (brand, slug, colour) — one handle-prefix query per brand instead of
  //      a walk of the whole variant table (lib/fashionbiz-stock-groups).
  const { groups, variantCount } = await loadFashionBizStockGroups(query)

  if (!variantCount) {
    logger.info("No FashionBiz variants found in catalog — nothing to sync.")
    await writeCheckpoint(container, startedAt.toISOString())
    return
  }
  logger.info(
    `Sweeping ${groups.size} (brand,slug,colour) groups across ${variantCount} variants.`
  )

  // 3. Fetch stock for every group; build sku -> totalQty map.
  const stockBySku = new Map<string, number>()
  let groupErrors = 0
  for (const group of groups.values()) {
    try {
      const resp = await fashionbiz.fetchStock(group.brand, group.slug, group.colour)
      for (const item of resp.items ?? []) {
        if (!item.sku) continue
        const total = (item.stock ?? []).reduce((a, s) => a + (s.qtyAvailable ?? 0), 0)
        stockBySku.set(item.sku, total)
      }
    } catch (err: any) {
      groupErrors++
      logger.warn(
        `Stock fetch failed for ${group.brand}/${group.slug}/${group.colour}: ${err?.message ?? err}`
      )
    }
    await sleep(THROTTLE_MS)
  }

  if (!stockBySku.size) {
    logger.warn(`No stock data returned (${groupErrors} group errors). Leaving levels untouched.`)
    await writeCheckpoint(container, startedAt.toISOString())
    return
  }

  // 4. Change-only, chunked, sanity-guarded write (lib/inventory-level-writes).
  //    A "200 OK with the wrong shape" that zeroes everything is refused here.
  const result = await writeInventoryLevels(container, { stockBySku, locationId, logger })
  if (result.aborted) {
    logger.warn(`FashionBiz inventory sync ABORTED (checkpoint not advanced): ${result.reason}`)
    return
  }

  await writeCheckpoint(container, startedAt.toISOString())
  logger.info(
    `FashionBiz inventory sync done — SKUs synced: ${stockBySku.size}, levels created: ${result.created}, updated: ${result.updated}, unchanged: ${result.unchanged}, group errors: ${groupErrors}.`
  )
}

async function writeCheckpoint(container: MedusaContainer, value: string) {
  try {
    const cache = container.resolve(Modules.CACHE) as any
    // Explicit TTL (review 2-4): a checkpoint that outlives a broken run would
    // skip rows forever; 48 h means a missed run self-heals into a full sync.
    await cache.set(CHECKPOINT_KEY, value, 48 * 3600)
  } catch {
    // Cache module not available — checkpoint is monitoring-only, safe to skip.
  }
}

export default withJobContext(handler)

export const config = {
  name: "sync-fashionbiz-inventory",
  schedule: "0 4 * * *", // daily at 04:00 UTC
}

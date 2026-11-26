import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { writeInventoryLevels } from "../lib/inventory-level-writes"
import { withJobContext, getContextLogger } from "../lib/job-context-wrapper"
import { withSupplierLock } from "../lib/supplier-sync-lock"
import {
  LEGENDLIFE_LOCATION_NAME,
  fetchLegendLifePricingAndStock,
  legendLifeToken,
  mapLimit,
  stockBySkuFrom,
} from "../lib/legendlife-catalog"

/**
 * Daily Legend Life stock sweep into the "Legend Life Warehouse" location.
 *
 * Legend Life has no bulk or "changed since" stock call, so this asks
 * /customer/stylePricingAndStock once per imported style (4 at a time;
 * ~840 styles ≈ 2½ minutes). Only styles we've imported are fetched.
 * No-ops without LEGENDLIFE_API_TOKEN.
 */
const handler = (container: MedusaContainer) =>
  withSupplierLock(container, "legendlife", () => syncLegendLifeInventory(container))

async function syncLegendLifeInventory(container: MedusaContainer) {
  const logger = getContextLogger(container)
  const token = legendLifeToken()
  if (!token) {
    logger.info("LEGENDLIFE_API_TOKEN not set — skipping Legend Life inventory sync.")
    return
  }

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const [location] = await stockLocationService.listStockLocations({ name: LEGENDLIFE_LOCATION_NAME })
  if (!location) {
    logger.warn(`Stock location "${LEGENDLIFE_LOCATION_NAME}" not found — run import-legendlife first.`)
    return
  }

  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows: Array<{ code: string | null }> = await pg
    .select(pg.raw("metadata->'legendlife'->>'style_code' as code"))
    .from("product")
    .whereNull("deleted_at")
    .whereRaw("metadata->>'source' = ?", ["legendlife"])
  const styleCodes = [...new Set(rows.map((r) => r.code).filter((c): c is string => !!c))]
  if (!styleCodes.length) {
    logger.info("No Legend Life products imported — nothing to sync.")
    return
  }

  const stockBySku = new Map<string, number>()
  let failed = 0
  await mapLimit(styleCodes, 4, async (code) => {
    try {
      const ps = await fetchLegendLifePricingAndStock(code, token)
      for (const [sku, qty] of stockBySkuFrom(ps)) stockBySku.set(sku, qty)
    } catch (err: any) {
      failed++
      logger.warn(`Legend Life stock fetch failed for ${code}: ${err?.message ?? err}`)
    }
  })
  // A failed style keeps yesterday's levels (it's simply absent from the plan);
  // a wholesale outage is refused rather than zeroing stock.
  if (failed > styleCodes.length / 2) {
    logger.error(`Legend Life inventory sync ABORTED — ${failed}/${styleCodes.length} styles failed.`)
    return
  }

  const result = await writeInventoryLevels(container, { stockBySku, locationId: location.id, logger })
  if (result.aborted) {
    logger.warn(`Legend Life inventory sync ABORTED: ${result.reason}`)
    return
  }
  logger.info(
    `Legend Life inventory sync done — ${styleCodes.length} styles (${failed} failed), SKUs ${stockBySku.size}, created ${result.created}, updated ${result.updated}, unchanged ${result.unchanged}.`
  )
}

export default withJobContext(handler)

export const config = {
  name: "sync-legendlife-inventory",
  schedule: "30 5 * * *", // daily 05:30 UTC, after Aussie Pacific
}

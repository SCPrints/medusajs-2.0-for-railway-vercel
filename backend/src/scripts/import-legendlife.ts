/**
 * Legend Life catalogue import (CLI) — every style from the Legend Life REST
 * API as a DRAFT product for staff to review. The work is done by
 * importLegendLifeStyles (services/supplier-catalog-sync/legendlife-import.ts),
 * which the nightly supplier catalogue sync also uses.
 *
 * Usage:
 *   IMPORT_DRY_RUN=1 npx medusa exec src/scripts/import-legendlife.ts
 * Prod (Fly):
 *   cd /app/.medusa/server && npx medusa exec src/scripts/import-legendlife.js
 *
 * Env: LEGENDLIFE_API_TOKEN (required), LEGENDLIFE_COST_ADJUSTMENT (default 1),
 *      IMPORT_DRY_RUN=1, IMPORT_LIMIT=N, IMPORT_STYLES=ST2000,JH100
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fetchAllLegendLifeProducts, legendLifeToken } from "../lib/legendlife-catalog"
import { importLegendLifeStyles } from "../services/supplier-catalog-sync/legendlife-import"

export default async function importLegendLife({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const token = legendLifeToken()
  if (!token) throw new Error("Set LEGENDLIFE_API_TOKEN")
  const limit = Number.parseInt(process.env.IMPORT_LIMIT ?? "", 10)
  const onlyStyles = new Set(
    (process.env.IMPORT_STYLES ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  )

  let products = await fetchAllLegendLifeProducts(token)
  logger.info(`Legend Life: ${products.length} styles in the catalogue.`)
  if (onlyStyles.size) products = products.filter((p) => onlyStyles.has(p.styleCode.toUpperCase()))
  if (limit > 0) products = products.slice(0, limit)

  const r = await importLegendLifeStyles(container, products, {
    token,
    dryRun: ["1", "true"].includes(process.env.IMPORT_DRY_RUN ?? ""),
  })
  for (const e of r.errors) logger.warn(`[legendlife] ${e.code}: ${e.error}`)
  logger.info(`Legend Life import complete — ${r.imported.length} draft products created, ${r.skipped.length} skipped, ${r.errors.length} errors.`)
}

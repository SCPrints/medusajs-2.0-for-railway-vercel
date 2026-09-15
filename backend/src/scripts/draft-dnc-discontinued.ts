/**
 * Unpublish DNC products the Volume 13 price list marks Condition=Discontinued.
 *
 * The importer skips discontinued rows on CREATE, but products imported before
 * that guard (or re-published since) stay live. This sets them to `draft` via
 * updateProductsWorkflow so product.updated fires → Meili drops the doc +
 * storefront cache purges. Reversible in admin.
 *
 *   DRY_RUN=1 npx medusa exec src/scripts/draft-dnc-discontinued.ts
 *   DNC_CODES=1202,1130 npx medusa exec src/scripts/draft-dnc-discontinued.ts   # subset
 */
import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

const CSV_NAME = "DNC Workwear Volume 13 Price List - Product data (CSV).csv"

const discontinuedCodesFromCsv = (): string[] => {
  const file = [path.resolve("data", CSV_NAME), path.resolve("backend", "data", CSV_NAME)].find((p) =>
    fs.existsSync(p),
  )
  if (!file) return []
  // ponytail: naive split — this CSV has no quoted commas in the first 8 columns
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","))
    .filter((c) => c[2] === "" && c[3] === "" && c[7] === "Discontinued")
    .map((c) => c[0].trim())
}

export default async function draftDncDiscontinued({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const dryRun = process.env.DRY_RUN === "1"

  const codes = process.env.DNC_CODES?.split(",").map((c) => c.trim()).filter(Boolean) ?? discontinuedCodesFromCsv()
  const handles = [...new Set(codes.map((c) => `dnc-${c.toLowerCase()}`))]
  if (!handles.length) {
    logger.warn("No discontinued DNC codes found (CSV missing? set DNC_CODES)")
    return
  }

  const live = await productModule.listProducts(
    { handle: handles, status: ProductStatus.PUBLISHED },
    { select: ["id", "handle", "title"] },
  )
  logger.info(`${handles.length} discontinued handles → ${live.length} still published${dryRun ? " (DRY RUN)" : ""}`)
  for (const p of live) logger.info(`  ${p.handle}  ${p.title}`)
  if (dryRun || !live.length) return

  await updateProductsWorkflow(container).run({
    input: { products: live.map((p) => ({ id: p.id, status: ProductStatus.DRAFT })) },
  })
  logger.info(`Drafted ${live.length} products`)
}

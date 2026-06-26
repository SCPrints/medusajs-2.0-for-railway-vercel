/**
 * One-shot repair for DNC products imported BEFORE the supplier-import-
 * pipeline wiring landed. Products created by the older import path have:
 *   - no Brand link
 *   - no product_type
 *   - no tags
 *   - no shop categories
 *
 * This script walks every dnc-* product and:
 *   1. Ensures the "DNC Workwear" Brand entity exists (auto-creates if not)
 *   2. Links every dnc-* product to it via the Module Link
 *   3. Runs applyTaxonomyToProducts (title fallback fills type + demographic tag)
 *   4. Runs applyShopCategoriesToProducts (DNC is in WORKWEAR_BRAND_HANDLES,
 *      so audience routing lands the right `<audience>-<sub>` handles)
 *
 * Idempotent — re-runs only fill gaps. Admin/surcharge products (Surcharge,
 * Cross-Docking Charge - *) need to be DELETED MANUALLY in admin; the
 * importer's new skip filter prevents future re-creation but doesn't clean
 * up the existing junk.
 *
 * Usage:
 *   npx medusa exec src/scripts/_repair-dnc-import.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BRAND_MODULE } from "../modules/brand"
import { classifyDncProduct } from "../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../lib/supplier-import-pipeline"

const DNC_BRAND_NAME = "DNC Workwear"
const DNC_BRAND_HANDLE = "dnc-workwear"
const DNC_BRAND_EXTERNAL_CODE = "DNC"

export default async function repairDncImport({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const brandService = container.resolve(BRAND_MODULE) as any

  // 1. Brand
  const existingBrands = await brandService.listBrands({})
  let dncBrand = (existingBrands as any[]).find(
    (b) =>
      (b.external_code ?? "").toUpperCase() === DNC_BRAND_EXTERNAL_CODE ||
      (b.handle ?? "").toLowerCase() === DNC_BRAND_HANDLE ||
      (b.name ?? "").toLowerCase() === DNC_BRAND_NAME.toLowerCase()
  )
  if (!dncBrand) {
    const [created] = await brandService.createBrands([
      {
        name: DNC_BRAND_NAME,
        handle: DNC_BRAND_HANDLE,
        external_code: DNC_BRAND_EXTERNAL_CODE,
        is_active: true,
      },
    ])
    dncBrand = created
    logger.info(`Created DNC brand: ${dncBrand.id}`)
  } else {
    logger.info(`Reusing existing DNC brand: ${dncBrand.id}`)
  }

  // 2. Fetch every dnc-* product
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const rows = ((products ?? []) as Array<{
    id: string
    handle: string
    title: string | null
  }>).map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title ?? undefined,
  }))

  logger.info(`Found ${rows.length} dnc-* product(s) to repair.`)

  if (!rows.length) {
    logger.info("Nothing to repair.")
    return
  }

  // 3. Brand link
  await linkProductsToBrand(container, rows, dncBrand.id)
  logger.info(`Brand-link step complete (idempotent — existing links skipped).`)

  // 4. Taxonomy
  // We don't have the original CSV rows for existing products; pass an empty
  // source per handle so classifyDncProduct gets called (returns null/empty)
  // and applyTitleFallbacks does the real work from `product.title`.
  const sourceByHandle = new Map<string, Record<string, string>>(
    rows.map((p) => [p.handle, {}])
  )
  await applyTaxonomyToProducts(container, {
    products: rows,
    sourceByHandle,
    classify: classifyDncProduct,
    logger,
  })

  // 5. Shop categories
  await applyShopCategoriesToProducts(container, rows, logger)

  logger.info(
    `Done. Verify in admin: brand link should be ${DNC_BRAND_NAME}, ` +
      `type/tags/categories populated. Manually delete Surcharge / Cross-Docking ` +
      `Charge admin items from admin (the importer's new filter prevents future re-creation).`
  )
}

/**
 * Backfill metadata.gsm on existing products by extracting GSM from
 * data that was already stored at import time.
 *
 * Sources checked (in priority order):
 *   1. metadata.thread_lab.gsm   — already numeric, copy directly
 *   2. metadata.shaka_wear.fabric_weight — string e.g. "7.5 oz / 255 GSM"
 *   3. metadata.gildan.fabric_weight    — string e.g. "200 GSM"
 *   4. product.description text  — regex search for "\d+ gsm" (covers FashionBiz)
 *
 * AS Colour products are skipped — the variant weight string was not stored
 * at import time and requires a fresh API pull. Run import-as-colour-from-api
 * with IMPORT_UPDATE_EXISTING=1 to pick up GSM on those products.
 *
 * Usage:
 *   pnpm --filter backend medusa exec backfill-product-gsm
 *   DRY_RUN=1 pnpm --filter backend medusa exec backfill-product-gsm
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { parseGsm } from "../utils/parse-gsm"

const PAGE_SIZE = 100

export default async function backfillProductGsm({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any

  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  if (dryRun) logger.info("[DRY RUN] backfill-product-gsm — no writes.")

  let offset = 0
  let total = 0
  let updated = 0
  let skipped = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "description", "metadata"],
      pagination: { skip: offset, take: PAGE_SIZE },
    })

    if (!products.length) break
    total += products.length

    for (const product of products as any[]) {
      const meta = (product.metadata ?? {}) as Record<string, any>

      // Skip products that already have a numeric gsm value.
      if (typeof meta.gsm === "number") {
        skipped++
        continue
      }

      const gsm = resolveGsm(meta, product.description ?? "")
      if (gsm === null) {
        skipped++
        continue
      }

      logger.info(
        `  ${dryRun ? "[DRY] " : ""}${product.id}: setting gsm=${gsm}`
      )

      if (!dryRun) {
        await productModule.updateProducts(product.id, {
          metadata: { ...meta, gsm },
        })
      }

      updated++
    }

    offset += PAGE_SIZE
    if (products.length < PAGE_SIZE) break
  }

  logger.info(
    `backfill-product-gsm complete. Scanned ${total} products: ` +
      `${updated} ${dryRun ? "would be " : ""}updated, ${skipped} skipped.`
  )
}

/**
 * Try every source to extract a numeric GSM value. Returns null if none found.
 */
function resolveGsm(
  meta: Record<string, any>,
  description: string
): number | null {
  // 1. Thread Lab already stores a numeric gsm under the supplier namespace.
  const tlGsm = meta.thread_lab?.gsm
  if (typeof tlGsm === "number") return tlGsm

  // 2. Shaka Wear — "7.5 oz / 255 GSM" string.
  const shakaWeight = meta.shaka_wear?.fabric_weight
  if (shakaWeight) {
    const n = parseGsm(shakaWeight)
    if (n !== null) return n
  }

  // 3. Gildan XLSX column — "200 GSM" string.
  const gildanWeight = meta.gildan?.fabric_weight
  if (gildanWeight) {
    const n = parseGsm(gildanWeight)
    if (n !== null) return n
  }

  // 4. FashionBiz stores GSM in the rendered description text.
  //    renderDescription produces "Fabric:\n- 60% Cotton; 190 GSM; ..."
  //    A simple regex finds the first "\d+ gsm" occurrence.
  if (description) {
    const n = parseGsm(description)
    if (n !== null) return n
  }

  return null
}

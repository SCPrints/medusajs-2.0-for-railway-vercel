/**
 * Backfill metadata.gsm for existing AS Colour products.
 *
 * The original importer discarded the weight string instead of extracting
 * a numeric GSM. This script fetches the full AS Colour product catalog,
 * tries to parse GSM from every string field on the product response
 * (fabric, weight, productWeight, description, etc.), and stamps
 * metadata.gsm on matching Medusa products.
 *
 * Usage:
 *   pnpm --filter backend medusa exec backfill-ascolour-gsm
 *   DRY_RUN=1 pnpm --filter backend medusa exec backfill-ascolour-gsm
 *   PROBE=1 pnpm --filter backend medusa exec backfill-ascolour-gsm
 *     (PROBE dumps the raw fields of the first 3 API products so you can
 *      see what's actually there without writing anything)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { parseGsm } from "../utils/parse-gsm"

const PAGE_SIZE = 100

/** Try every string-valued field on an API product object for a GSM number. */
function extractGsmFromProduct(p: Record<string, any>): number | null {
  const candidates = [
    p.fabricWeight,   // "320 GSM" — dedicated GSM field (confirmed via probe)
    p.composition,    // "Heavy weight, 320 GSM, 100% cotton canvas" — fallback
    p.weight,
    p.productWeight,
    p.fabric,
    p.material,
    p.description,
  ]
  for (const c of candidates) {
    if (!c) continue
    const n = parseGsm(String(c))
    if (n !== null) return n
  }
  return null
}

export default async function backfillAsColourGsm({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const asColourService = container.resolve<AsColourService>(ASCOLOUR_MODULE)

  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  const probe =
    process.env.PROBE === "1" || process.env.PROBE === "true"

  if (dryRun) logger.info("[DRY RUN] backfill-ascolour-gsm — no writes.")

  // 1. Fetch the AS Colour product catalog (product-level fields, no variants).
  logger.info("Fetching AS Colour product catalog from API...")
  const apiProducts = await asColourService.fetchAllProducts()
  logger.info(`Fetched ${apiProducts.length} products from AS Colour API.`)

  // PROBE mode: dump raw fields of the first few products so we can see
  // what the API actually returns without writing anything.
  if (probe) {
    for (const p of (apiProducts as any[]).slice(0, 3)) {
      logger.info(`PROBE product ${p.styleCode}: ${JSON.stringify(p)}`)
    }
    return
  }

  // 2. Build styleCode → GSM map from API data.
  const gsmByStyleCode = new Map<string, number>()
  for (const p of apiProducts as any[]) {
    const gsm = extractGsmFromProduct(p)
    if (gsm !== null) gsmByStyleCode.set(p.styleCode, gsm)
  }
  logger.info(
    `Resolved GSM for ${gsmByStyleCode.size}/${apiProducts.length} styles from API fields.`
  )

  if (!gsmByStyleCode.size) {
    logger.warn(
      "No GSM found in any product field. Run with PROBE=1 to inspect the raw API response shape."
    )
    return
  }

  // 3. Query Medusa for AS Colour products missing metadata.gsm.
  logger.info("Querying Medusa for AS Colour products without gsm...")
  const toUpdate: Array<{ id: string; styleCode: string; meta: Record<string, any> }> = []
  let offset = 0

  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "metadata"],
      pagination: { skip: offset, take: PAGE_SIZE },
    })

    if (!(products as any[]).length) break

    for (const p of products as any[]) {
      const meta = (p.metadata ?? {}) as Record<string, any>
      if (meta.source !== "ascolour") continue
      if (typeof meta.gsm === "number") continue
      const styleCode = meta.ascolour?.styleCode
      if (!styleCode) continue
      toUpdate.push({ id: p.id, styleCode, meta })
    }

    offset += PAGE_SIZE
    if ((products as any[]).length < PAGE_SIZE) break
  }

  logger.info(`Found ${toUpdate.length} AS Colour products without gsm.`)

  // 4. Stamp metadata.gsm.
  let updated = 0
  let skipped = 0

  for (const { id, styleCode, meta } of toUpdate) {
    const gsm = gsmByStyleCode.get(styleCode)
    if (gsm === undefined) {
      skipped++
      continue
    }

    logger.info(`  ${dryRun ? "[DRY] " : ""}${id} (${styleCode}): gsm=${gsm}`)

    if (!dryRun) {
      await productModule.updateProducts(id, {
        metadata: { ...meta, gsm },
      })
    }

    updated++
  }

  logger.info(
    `backfill-ascolour-gsm complete. ${updated} ${dryRun ? "would be " : ""}updated, ${skipped} skipped (no GSM in API for that style).`
  )
}

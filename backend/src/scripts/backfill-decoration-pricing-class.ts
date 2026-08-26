/**
 * Backfill `metadata.decoration_pricing_class` across the catalog from fabric
 * composition (2026-08 decision: ≥65% polyester → "supacolour"; softshell /
 * nylon / PVC / technical → "quote_only"; everything else stays standard DTF).
 *
 * Sources, in order: product.material, then title+type text (many DNC rows
 * have neither — those stay unflagged and are logged as the review list for
 * staff to classify via the product widget).
 *
 * Never overwrites an existing class (staff decisions win). Skips internal
 * service products. DRY_RUN=1 previews.
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-decoration-pricing-class.ts
 *   npx medusa exec src/scripts/backfill-decoration-pricing-class.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const POLY_THRESHOLD = 65 // percent — Sean, 2026-08

type Classification = "supacolour" | "quote_only" | null

function classify(material: string | null, title: string, typeValue: string): {
  cls: Classification
  reason: string
} {
  const m = (material ?? "").toLowerCase().trim()
  const fallback = `${title} ${typeValue}`.toLowerCase()
  const text = m || fallback

  if (/softshell|soft shell|nylon|pvc|polyurethane|umbrella|puffer/.test(text)) {
    return { cls: "quote_only", reason: "technical fabric" }
  }
  const pm = /(\d+)\s*%[^,;/%]*?poly/.exec(text)
  const polyPct = pm ? parseInt(pm[1], 10) : null
  const hasPoly = text.includes("poly")
  const hasCotton = text.includes("cotton")
  if (polyPct !== null) {
    return polyPct >= POLY_THRESHOLD
      ? { cls: "supacolour", reason: `${polyPct}% poly` }
      : { cls: null, reason: `${polyPct}% poly — below threshold` }
  }
  if (hasPoly && !hasCotton) {
    return { cls: "supacolour", reason: "polyester, no cotton stated" }
  }
  if (!m && !hasPoly && !hasCotton) {
    return { cls: null, reason: "no fabric data" }
  }
  return { cls: null, reason: "cotton/other" }
}

export default async function backfillDecorationPricingClass({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const dryRun = process.env.DRY_RUN === "1"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "material", "metadata", "type.value"],
    filters: { status: "published" },
    pagination: { take: 100000 },
  })

  let supa = 0
  let quoteOnly = 0
  let skippedExisting = 0
  const reviewList: string[] = []
  for (const product of products as Array<{
    id: string
    title: string | null
    handle: string | null
    material: string | null
    metadata: Record<string, unknown> | null
    type?: { value?: string | null } | null
  }>) {
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    if (meta.internal_service === true) continue
    if (meta.decoration_pricing_class !== undefined && meta.decoration_pricing_class !== null) {
      skippedExisting++
      continue
    }
    const { cls, reason } = classify(
      product.material,
      product.title ?? "",
      product.type?.value ?? ""
    )
    if (!cls) {
      if (reason === "no fabric data") reviewList.push(`${product.title} (${product.handle})`)
      continue
    }
    if (cls === "supacolour") supa++
    else quoteOnly++
    if (dryRun) {
      logger.info(`[backfill-pricing-class] DRY RUN ${cls}: ${product.title} — ${reason}`)
      continue
    }
    // Read-modify-write: bare metadata updates REPLACE the jsonb blob.
    await productModule.updateProducts(product.id, {
      metadata: { ...meta, decoration_pricing_class: cls },
    })
  }

  logger.info(
    `[backfill-pricing-class] ${dryRun ? "DRY RUN — " : ""}supacolour: ${supa}, quote_only: ${quoteOnly}, ` +
      `already-set skipped: ${skippedExisting}, scanned: ${products.length}.`
  )
  if (reviewList.length) {
    logger.info(
      `[backfill-pricing-class] REVIEW LIST (${reviewList.length} products, no fabric data — classify via the product widget):`
    )
    for (const item of reviewList) logger.info(`  - ${item}`)
  }
  if (!dryRun) {
    logger.info(
      "[backfill-pricing-class] Storefront product caches refresh within ~10 min; purge via revalidate-products for immediate effect."
    )
  }
}

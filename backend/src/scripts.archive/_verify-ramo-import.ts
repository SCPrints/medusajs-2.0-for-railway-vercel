/**
 * One-shot verification of the most recent Ramo import. Read-only.
 * Prints per-product: brand link, type, tags, categories.
 *
 * Usage: npx medusa exec src/scripts/_verify-ramo-import.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BRAND_MODULE } from "../modules/brand"

export default async function verifyRamoImport({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const brandService = container.resolve(BRAND_MODULE) as any

  // 1. Brand
  const brands = (await brandService.listBrands({
    handle: "ramo",
  })) as Array<{ id: string; name: string; handle: string; external_code: string | null }>
  if (!brands.length) {
    logger.error('No Ramo brand found.')
    return
  }
  const ramo = brands[0]!
  logger.info(`Brand: name="${ramo.name}" handle="${ramo.handle}" external_code="${ramo.external_code}" id=${ramo.id}`)

  // 2. Products
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "status",
      "type.value",
      "tags.value",
      "categories.handle",
      "categories.name",
      "variants.id",
      "variants.sku",
      "variants.metadata",
    ],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 50 },
  })

  const rows = (products ?? []) as Array<{
    id: string
    handle: string
    title: string | null
    status: string | null
    type?: { value?: string | null } | null
    tags?: Array<{ value: string }>
    categories?: Array<{ handle: string; name: string }>
    variants?: Array<{ id: string; sku: string | null; metadata?: Record<string, unknown> | null }>
  }>

  logger.info(`Found ${rows.length} ramo-prefixed product(s) in DB.`)

  // 3. Brand links — query the join table directly via PG
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const knex = pgConnection
  const linkRows = (await knex
    .from("product_product_brand_brand")
    .whereIn(
      "product_id",
      rows.map((r) => r.id)
    )
    .select("product_id", "brand_id")) as Array<{ product_id: string; brand_id: string }>
  const linkedProductIds = new Set(linkRows.map((l) => l.product_id))

  for (const p of rows) {
    const link = linkedProductIds.has(p.id) ? "✓" : "✗"
    const type = p.type?.value ?? "(null)"
    const tags = (p.tags ?? []).map((t) => t.value).join(", ") || "(none)"
    const cats = (p.categories ?? []).map((c) => c.handle).join(", ") || "(none)"
    const variants = p.variants?.length ?? 0
    const meta = p.variants?.[0]?.metadata ?? {}
    const bulk = (meta as any).bulk_pricing
    const tiers = bulk?.tiers ?? []
    const pricing = tiers.length
      ? tiers.map((t: any) => `${t.min_quantity}-${t.max_quantity ?? "+"}:$${t.amount}`).join(" / ")
      : "(no tiers)"

    logger.info(
      `  [${link}] ${p.handle} (${p.status}) type=${type}`
    )
    logger.info(`      title: ${p.title}`)
    logger.info(`      tags: ${tags}`)
    logger.info(`      categories: ${cats}`)
    logger.info(`      variants: ${variants}`)
    logger.info(`      pricing (variant 1): ${pricing}`)
  }

  const orphans = rows.length - linkedProductIds.size
  if (orphans) {
    logger.warn(`${orphans} product(s) have no Brand link.`)
  } else {
    logger.info(`All ${rows.length} product(s) linked to Ramo brand.`)
  }
}

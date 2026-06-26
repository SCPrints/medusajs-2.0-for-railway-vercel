/**
 * Audit the full Ramo import — counts, untyped/uncategorised products,
 * brand-link drift. Read-only.
 *
 * Usage: npx medusa exec src/scripts/_audit-ramo-import.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function auditRamoImport({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

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
    ],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 1000 },
  })
  const rows = (products ?? []) as Array<{
    id: string
    handle: string
    title: string | null
    status: string | null
    type?: { value?: string | null } | null
    tags?: Array<{ value: string }>
    categories?: Array<{ handle: string }>
  }>

  logger.info(`Total ramo-prefixed products: ${rows.length}`)

  // Brand link
  const linkRows = (await pgConnection
    .from("product_product_brand_brand")
    .whereIn("product_id", rows.map((r) => r.id))
    .select("product_id")) as Array<{ product_id: string }>
  const linked = new Set(linkRows.map((l) => l.product_id))

  const stats = {
    linked: 0,
    unlinked: 0,
    typed: 0,
    untyped: 0,
    categorized: 0,
    uncategorized: 0,
    hasDemographic: 0,
    hasUnisex: 0,
    hasNoDemoTag: 0,
  }
  const DEMO_TAGS = new Set(["Men", "Women", "Kids"])
  const typeCounts = new Map<string, number>()
  const untypedProducts: Array<{ handle: string; title: string }> = []
  const uncategorizedProducts: Array<{ handle: string; title: string; type: string | null }> = []

  for (const p of rows) {
    if (linked.has(p.id)) stats.linked++; else stats.unlinked++
    const type = p.type?.value ?? null
    if (type) {
      stats.typed++
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
    } else {
      stats.untyped++
      untypedProducts.push({ handle: p.handle, title: p.title ?? "" })
    }
    const cats = (p.categories ?? []).map((c) => c.handle)
    if (cats.length) {
      stats.categorized++
    } else {
      stats.uncategorized++
      uncategorizedProducts.push({ handle: p.handle, title: p.title ?? "", type })
    }
    const tags = (p.tags ?? []).map((t) => t.value)
    if (tags.some((t) => DEMO_TAGS.has(t))) stats.hasDemographic++
    else if (tags.includes("Unisex")) stats.hasUnisex++
    else stats.hasNoDemoTag++
  }

  logger.info("=== Stats ===")
  logger.info(`  Brand link: ${stats.linked} ok, ${stats.unlinked} missing`)
  logger.info(`  Type: ${stats.typed} set, ${stats.untyped} null`)
  logger.info(`  Shop categories: ${stats.categorized} assigned, ${stats.uncategorized} none`)
  logger.info(`  Demographic tag: ${stats.hasDemographic} explicit (Men/Women/Kids), ${stats.hasUnisex} Unisex, ${stats.hasNoDemoTag} none`)

  logger.info("=== Type distribution ===")
  const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])
  for (const [t, n] of sorted) {
    logger.info(`  ${n.toString().padStart(4)}  ${t}`)
  }

  if (untypedProducts.length) {
    logger.warn(`=== Untyped products (${untypedProducts.length}) — title-fallback couldn't determine a type ===`)
    for (const p of untypedProducts.slice(0, 30)) {
      logger.warn(`  ${p.handle}: ${p.title}`)
    }
    if (untypedProducts.length > 30) {
      logger.warn(`  ... and ${untypedProducts.length - 30} more`)
    }
  }

  if (uncategorizedProducts.length && uncategorizedProducts.length !== untypedProducts.length) {
    logger.warn(`=== Uncategorized products (${uncategorizedProducts.length}) — no shop category assigned ===`)
    for (const p of uncategorizedProducts.slice(0, 10)) {
      logger.warn(`  ${p.handle} (type=${p.type}): ${p.title}`)
    }
  }
}

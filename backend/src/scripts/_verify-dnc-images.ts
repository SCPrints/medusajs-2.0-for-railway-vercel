/**
 * Quick verification: inspect what images / thumbnails landed for a sample
 * of DNC products. Read-only.
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_verify-dnc-images.js
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const SAMPLE_HANDLES = [
  // Numeric-prefix products that DO have Image URLs in the CSV.
  "dnc-1101", // Traditional Chef Jacket - Short Sleeve
  "dnc-1102", // Traditional Chef Jacket - Long Sleeve
  "dnc-1103",
  "dnc-3322", // arbitrary mid-catalog sample
  "dnc-3402",
  // Z-prefix products that DON'T have Image URLs in the CSV (control sample).
  "dnc-z929", // HiVis D/N 1/2 Zip Fleecy Top
  "dnc-z930",
  "dnc-z9002", // Surcharge — junk
]

export default async function verifyDncImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  // Catalog-wide image coverage
  const { data: all } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.url"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const rows = (all ?? []) as Array<{
    id: string
    handle: string
    thumbnail: string | null
    images: Array<{ url: string }> | null
  }>

  let withThumbnail = 0
  let withImages = 0
  let withBoth = 0
  let withNeither = 0
  for (const p of rows) {
    const hasThumb = !!(p.thumbnail && p.thumbnail.trim())
    const hasImgs = !!(p.images && p.images.length > 0)
    if (hasThumb) withThumbnail++
    if (hasImgs) withImages++
    if (hasThumb && hasImgs) withBoth++
    if (!hasThumb && !hasImgs) withNeither++
  }

  logger.info(`=== DNC catalog image coverage (${rows.length} total) ===`)
  logger.info(`  with thumbnail set: ${withThumbnail}`)
  logger.info(`  with images[] non-empty: ${withImages}`)
  logger.info(`  with BOTH: ${withBoth}`)
  logger.info(`  with NEITHER: ${withNeither}`)

  logger.info(`=== Sample inspection ===`)
  for (const handle of SAMPLE_HANDLES) {
    const row = rows.find((r) => r.handle === handle)
    if (!row) {
      logger.info(`  ${handle}: NOT FOUND`)
      continue
    }
    const thumb = row.thumbnail ?? "(null)"
    const imgs = row.images ?? []
    logger.info(`  ${handle}:`)
    logger.info(`    thumbnail: ${thumb}`)
    logger.info(`    images[${imgs.length}]: ${imgs.slice(0, 3).map((i) => i.url).join(", ") || "(empty)"}`)
  }
}

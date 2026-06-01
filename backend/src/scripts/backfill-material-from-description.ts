/**
 * Backfill product.material from HTML descriptions across multiple suppliers.
 *
 * Different suppliers embed fabric composition in different ways:
 *   - Aussie Pacific: "<p>Fabric:<br>160gm 100% Polyester</p>" (label-anchored)
 *   - Ramo:          "<p>220 gsm 75% cotton 25% polyester denim<br />...</p>" (first
 *                    line is the composition; no label)
 *
 * This script applies the matching extractor per brand and writes the result to
 * the native `product.material` column. Only updates products whose material is
 * currently empty — never overwrites manually-edited values.
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-material-from-description.ts
 *   # then drop DRY_RUN=1 to apply.
 *
 * After running, trigger `reindex-meilisearch.js` so material_text gets pushed
 * to the search index for the fabric search/filter pages.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { extractFabricFromHtml as extractFabricAP } from "./import-aussie-pacific-from-api"

const BATCH = 200

/**
 * Ramo embeds fabric on the first line(s) of the description with no label.
 * Pattern: weight (GSM) and/or composition (% / fabric noun) on consecutive
 * lines. We collect the first run of consecutive "fabric-relevant" lines and
 * stop as soon as a non-fabric line appears (typically "contains pocket",
 * dimensions, or feature bullets).
 */
const RAMO_FABRIC_KEYWORDS =
  /(cotton|polyester|nylon|spandex|elastane|viscose|wool|linen|denim|canvas|jersey|fleece|polar|merino|bamboo|acrylic|gsm|gm\b|%)/i

export function extractFabricFromRamoHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&bull;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")

  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[\s•·]+|[\s•·]+$/g, "").trim())
    .filter(Boolean)

  const out: string[] = []
  let started = false
  for (const line of lines) {
    if (RAMO_FABRIC_KEYWORDS.test(line)) {
      out.push(line)
      started = true
    } else if (started) {
      break
    }
  }
  if (!out.length) return null
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, 250) || null
}

type Extractor = (html: string | null | undefined) => string | null

const EXTRACTORS: Array<{
  source_label: string
  matches: (product: any) => boolean
  extract: Extractor
}> = [
  {
    source_label: "aussiepacific",
    matches: (p) => (p.metadata as any)?.source === "aussiepacific",
    extract: extractFabricAP,
  },
  {
    source_label: "ramo",
    // Ramo products carry no `source` key — identify by brand handle.
    matches: (p) => {
      const brand = Array.isArray(p.brand) ? p.brand[0] : p.brand
      return brand?.handle === "ramo"
    },
    extract: extractFabricFromRamoHtml,
  },
]

export default async function backfillMaterialFromDescription({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  logger.info(`[backfill-material] Starting (dry_run=${dryRun})`)

  // per-source counters
  const tally: Record<string, { updated: number; skipped: number; no_fabric: number }> = {}
  const bump = (src: string, field: "updated" | "skipped" | "no_fabric") => {
    tally[src] = tally[src] ?? { updated: 0, skipped: 0, no_fabric: 0 }
    tally[src][field] += 1
  }

  let offset = 0
  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "title", "material", "description", "metadata", "brand.handle"],
      pagination: { take: BATCH, skip: offset },
      filters: { status: "published" },
    })
    if (!products.length) break

    for (const product of products as any[]) {
      const extractor = EXTRACTORS.find((e) => e.matches(product))
      if (!extractor) continue

      const src = extractor.source_label

      if (product.material && typeof product.material === "string" && product.material.trim()) {
        bump(src, "skipped")
        continue
      }

      const fabric = extractor.extract(product.description)
      if (!fabric) {
        bump(src, "no_fabric")
        logger.warn(`[backfill-material] (${src}) No fabric: ${product.handle}`)
        continue
      }

      logger.info(`[backfill-material] (${src}) ${product.handle}: "${fabric.slice(0, 100)}"`)

      if (!dryRun) {
        await productModule.updateProducts(product.id, { material: fabric })
      }
      bump(src, "updated")
    }

    offset += products.length
    if (products.length < BATCH) break
  }

  logger.info("[backfill-material] Summary by source:")
  for (const [src, counts] of Object.entries(tally)) {
    logger.info(
      `  ${src}: updated=${counts.updated}, already_had=${counts.skipped}, no_fabric_in_desc=${counts.no_fabric}`
    )
  }
  logger.info(`[backfill-material] Done (dry_run=${dryRun})`)
}

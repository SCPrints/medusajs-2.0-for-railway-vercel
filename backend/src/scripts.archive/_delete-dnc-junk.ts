/**
 * Delete DNC admin / freight / service / placeholder products that
 * shouldn't be in the catalog. Defaults to DRY RUN — pass `-- --apply`
 * to actually delete.
 *
 * Matches by:
 *   1. Hardcoded handle list (catches the items we identified by scrape failure)
 *   2. Exact title match (case-insensitive) for items whose handle we don't know
 *   3. Title contains match for "custom made indent item" (×3 variants)
 *
 * Idempotent — safe to re-run. Items already deleted are silently skipped.
 *
 * Add new junk handles/titles to the lists below if you spot more in admin.
 *
 * Usage on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server
 *   npx medusa exec src/scripts/_delete-dnc-junk.js              # dry run
 *   npx medusa exec src/scripts/_delete-dnc-junk.js -- --apply   # actually delete
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

// Hardcoded handles confirmed as non-products from the scrape audit.
// Conservative — only items where the handle pattern is clearly admin/
// freight/service/placeholder. Add more here as you spot them in admin.
const DNC_JUNK_HANDLES: ReadonlySet<string> = new Set([
  // Admin / freight surcharges
  "dnc-z9002", // Surcharge
  "dnc-zxdbox", // Cross-Docking Charge - BOX
  "dnc-zxdctn", // Cross-Docking Charge - CTN
  "dnc-zxdeach", // Cross-Docking Charge - EACH
  "dnc-zxdoutr", // Cross-Docking Charge - OUTR
  "dnc-zxdpair", // Cross-Docking Charge - PAIR
  "dnc-zxdplt", // Cross-Docking Charge - PLT
  "dnc-zxdplt2", // Cross-Docking Charge - PLT2
  "dnc-zxdplt3", // Cross-Docking Charge - PLT3
  "dnc-zxdrol", // Cross-Docking Charge - ROL
  // Service line items
  "dnc-clip", // Clipper's Items
  "dnc-cu01", // Custom items
  "dnc-cu02",
  "dnc-cu03",
  "dnc-cu04",
  "dnc-cu05",
  "dnc-prin", // Print services
  // Brand placeholders
  "dnc-fbiz00009", // Fashion Biz placeholder
  "dnc-tsco00009",
  "dnc-jb41", // JB's brand placeholder
  // Misc admin / unclear codes — see scrape log warnings
  "dnc-1std", // "1ST Digree" — unclear, treat as junk
  "dnc-b000",
  "dnc-bsp1",
  "dnc-bx-treme32", // Bilsom X-treme 32 — hearing-protection model name placeholder
  "dnc-scal",
  // Discontinued Cotton Chambray range (CSV had Condition=Discontinued)
  "dnc-z101",
  "dnc-z102",
  "dnc-z103",
  "dnc-z104",
  "dnc-z105",
  "dnc-z106",
])

// Exact title matches (case-insensitive). Catches the admin items whose
// handles we didn't capture in the scrape log.
const DNC_JUNK_TITLES_EXACT: ReadonlyArray<string> = [
  "Surcharge",
  "Cross-Docking Charge - BOX",
  "Cross-Docking Charge - CTN",
  "Cross-Docking Charge - EACH",
  "Cross-Docking Charge - OUTR",
  "Cross-Docking Charge - PAIR",
  "Cross-Docking Charge - PLT",
  "Cross-Docking Charge - PLT2",
  "Cross-Docking Charge - PLT3",
  "Cross-Docking Charge - ROL",
  "POSTER The Tough Breed",
  "POSTER WHAT A RIPPER",
  "Free Price List",
  "Catalogue",
  "NOTES",
  "DNC BOXES",
  "Glow Weave",
  "Fashion Biz",
  "JB's",
  "Add Reflective Tape-MJ",
  "Embroidery MONO Land",
  "Embroidery YF",
  "Custom Cut",
  "Screen Print- DMH",
  "Siltech-Custom Made S/S",
  "Clipper's Items",
  "# 8910 3M R/TAPE",
  "Bilsom X-treme 32",
  "1ST Digree",
]

// Title contains (case-insensitive). Use for variants like the three
// "custom made indent item" rows.
const DNC_JUNK_TITLE_CONTAINS: ReadonlyArray<string> = [
  "custom made indent item",
]

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.DNC_DELETE_JUNK_APPLY === "1" ||
  process.env.DNC_DELETE_JUNK_APPLY === "true"

export default async function deleteDncJunk({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const apply = getApplyFlag(args)

  logger.info(`Mode: ${apply ? "APPLY (will delete)" : "DRY RUN (no writes)"}`)

  // Fetch every dnc-* product so we can match titles client-side
  // (Medusa's $ilike against `title` is hit-or-miss across versions).
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
  }>)
  logger.info(`Scanned ${rows.length} dnc-* products.`)

  const exactTitles = new Set(
    DNC_JUNK_TITLES_EXACT.map((t) => t.trim().toLowerCase())
  )
  const containsTitles = DNC_JUNK_TITLE_CONTAINS.map((t) => t.toLowerCase())

  const toDelete: Array<{ id: string; handle: string; title: string; reason: string }> = []

  for (const p of rows) {
    const titleLower = (p.title ?? "").trim().toLowerCase()
    if (DNC_JUNK_HANDLES.has(p.handle)) {
      toDelete.push({
        id: p.id,
        handle: p.handle,
        title: p.title ?? "",
        reason: "handle",
      })
      continue
    }
    if (titleLower && exactTitles.has(titleLower)) {
      toDelete.push({
        id: p.id,
        handle: p.handle,
        title: p.title ?? "",
        reason: "exact title",
      })
      continue
    }
    if (titleLower && containsTitles.some((c) => titleLower.includes(c))) {
      toDelete.push({
        id: p.id,
        handle: p.handle,
        title: p.title ?? "",
        reason: "title contains",
      })
      continue
    }
  }

  logger.info(`Matched ${toDelete.length} junk product(s) for deletion.`)
  for (const d of toDelete) {
    logger.info(`  - ${d.handle} ("${d.title}") [matched by ${d.reason}]`)
  }

  if (!toDelete.length) {
    logger.info("Nothing to delete.")
    return
  }

  if (!apply) {
    logger.info("DRY RUN complete. Re-run with -- --apply to actually delete.")
    return
  }

  // Batch via the workflow so subscribers (revalidate cache, etc.) fire properly.
  const ids = toDelete.map((d) => d.id)
  await deleteProductsWorkflow(container).run({ input: { ids } })

  logger.info(`Deleted ${ids.length} product(s).`)
  logger.info("Post-delete: revalidate storefront cache; reindex Meilisearch if used.")
}

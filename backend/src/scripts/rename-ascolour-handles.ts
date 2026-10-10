import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import { BUNDLES_MODULE } from "../modules/bundles"
import { HOME_SECTION_MODULE } from "../modules/home-section"
import { LOOKBOOK_MODULE } from "../modules/lookbook"
import { QUOTE_MODULE } from "../modules/quote"
import { asColourHandle } from "../lib/ascolour-handle"
import { slugify } from "../utils/string-case"

/**
 * One-shot: rename the doubled AS Colour handles the original importer
 * produced ("as-colour-5001-5001" — it read `productName`, a field the API
 * never returns, and fell back to the style code twice) to the readable
 * shape the fixed importer now emits ("as-colour-staple-tee-5001").
 *
 * Also rewrites every stored handle reference we know of: bundle items,
 * home sections, lookbook items, quote line items. Order lines / saved
 * designs / wishlists reference products by id, not handle — untouched.
 *
 * Prints the old→new map between MAP_JSON_START / MAP_JSON_END so it can be
 * captured and committed to the storefront as the 301 table
 * (storefront/src/lib/data/legacy-handles.json).
 *
 *   DRY_RUN=1 — compute + print the map, write nothing
 *
 * Fly:  cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/rename-ascolour-handles.js
 */
export default async function renameAsColourHandles({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const dryRun = process.env.DRY_RUN === "1"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "metadata"],
    filters: { handle: { $like: "as-colour-%" } },
  })

  const existing = new Set<string>(products.map((p: any) => p.handle))
  const map: Record<string, string> = {}
  const skipped: string[] = []

  for (const p of products as any[]) {
    const code = String(p.metadata?.ascolour?.styleCode ?? "")
    const codeSlug = slugify(code)
    const title = String(p.title ?? "").trim()
    // Only touch the exact doubled shape — anything else was hand-edited.
    if (!code || p.handle !== `as-colour-${codeSlug}-${codeSlug}`) continue
    if (!title || /^as colour/i.test(title)) {
      skipped.push(`${p.handle} (no usable title: "${title}")`)
      continue
    }
    const next = asColourHandle(title, code)
    if (next === p.handle) continue
    if (existing.has(next) || Object.values(map).includes(next)) {
      skipped.push(`${p.handle} → ${next} (collision)`)
      continue
    }
    map[p.handle] = next
  }

  logger.info(`[rename-ascolour-handles] ${Object.keys(map).length} to rename, ${skipped.length} skipped${dryRun ? " (DRY RUN)" : ""}`)
  for (const s of skipped) logger.warn(`  skip ${s}`)

  const swap = (h: unknown) => (typeof h === "string" && map[h]) || h

  // --- stored handle references -------------------------------------------
  const bundles = container.resolve(BUNDLES_MODULE) as any
  const bundleItems = await bundles.listBundleItems({ product_handle: Object.keys(map) })
  const homeSections = container.resolve(HOME_SECTION_MODULE) as any
  const sections = (await homeSections.listHomeSections({})).filter((s: any) =>
    (s.product_handles?.handles ?? []).some((h: string) => map[h])
  )
  const lookbook = container.resolve(LOOKBOOK_MODULE) as any
  const tiles = (await lookbook.listLookbookItems({})).filter((t: any) =>
    (t.product_handles?.handles ?? []).some((h: string) => map[h])
  )
  const quotes = container.resolve(QUOTE_MODULE) as any
  const quoteRows = (await quotes.listQuotes({}, { select: ["id", "line_items"] })).filter((q: any) =>
    (q.line_items?.items ?? []).some((li: any) => map[li?.product_handle])
  )
  logger.info(
    `  refs: ${bundleItems.length} bundle items, ${sections.length} home sections, ${tiles.length} lookbook tiles, ${quoteRows.length} quotes`
  )

  if (!dryRun) {
    const ids = Object.fromEntries(products.map((p: any) => [p.handle, p.id]))
    const batch = Object.entries(map).map(([old, next]) => ({ id: ids[old], handle: next }))
    for (let i = 0; i < batch.length; i += 50) {
      await updateProductsWorkflow(container).run({ input: { products: batch.slice(i, i + 50) as never } })
      logger.info(`  renamed ${Math.min(i + 50, batch.length)}/${batch.length}`)
    }
    if (bundleItems.length)
      await bundles.updateBundleItems(bundleItems.map((b: any) => ({ id: b.id, product_handle: map[b.product_handle] })))
    if (sections.length)
      await homeSections.updateHomeSections(
        sections.map((s: any) => ({ id: s.id, product_handles: { handles: s.product_handles.handles.map(swap) } }))
      )
    if (tiles.length)
      await lookbook.updateLookbookItems(
        tiles.map((t: any) => ({ id: t.id, product_handles: { handles: t.product_handles.handles.map(swap) } }))
      )
    if (quoteRows.length)
      await quotes.updateQuotes(
        quoteRows.map((q: any) => ({
          id: q.id,
          line_items: {
            ...q.line_items,
            items: q.line_items.items.map((li: any) => ({ ...li, product_handle: swap(li?.product_handle) })),
          },
        }))
      )
  }

  console.log("MAP_JSON_START")
  console.log(JSON.stringify(map))
  console.log("MAP_JSON_END")
}

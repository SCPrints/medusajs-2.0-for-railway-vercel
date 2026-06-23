/**
 * Merge duplicate / phantom COLOUR option values on Gildan-family products.
 *
 * The Gildan xlsx types the SAME physical colour inconsistently across a
 * style's size rows — almost always the extended-size (3XL+) rows are typed in
 * ALL CAPS or misspelled. Because the importer keyed colours by the raw string,
 * one real colour split into two option values:
 *
 *   - "Neon Pink" (S–2XL) + "NEON PINK" (3XL only)   → two swatches, 3XL stranded
 *   - "Terracotta" (S–2XL) + "Terracota" (3XL only)  → two swatches, typo'd
 *   - "Navy" (all 6 sizes) + "NAVY" (0 variants)     → a swatch you can't buy
 *
 * On the storefront this renders as duplicate swatches plus "phantom" swatches
 * with no purchasable variant behind them. This script repairs the DATA:
 *
 *   1. Cluster a product's colour values that are the same physical colour, by:
 *        (a) case/whitespace fold  ("NEON PINK" == "Neon Pink"), and
 *        (b) shared SKU stem       (variants whose SKUs are identical except
 *            for the trailing ≤3-char size segment — catches misspellings like
 *            "Carribe"/"Caribe", "Terracota"/"Terracotta", since the colour
 *            CODE embedded in the SKU is the same).
 *   2. Pick the canonical value per cluster (the one carrying the MOST variants
 *      — the correctly-spelled, properly-cased one in every observed case).
 *   3. RE-POINT each stray variant onto the canonical colour value (preserving
 *      its size + every other option), or DELETE it if the canonical already
 *      has that size (a redundant duplicate SKU).
 *   4. PRUNE every now-emptied duplicate value AND any colour value that has
 *      zero variants (an unbuyable phantom swatch).
 *
 * Conservative by design:
 *   - Only merges when (a) or (b) fires — never on name similarity alone.
 *   - "Most variants wins" so the real colour is always kept, the stray dropped.
 *   - NEVER empties a product (if every colour would go, the product is skipped
 *     + logged for manual review).
 *   - Variant deletion is soft (Medusa default), so historical order snapshots
 *     survive.
 *
 * The importer itself was fixed (`mapping.ts` → `canonicalColourKey`) so new
 * imports / `IMPORT_UPDATE_EXISTING` runs can't re-split casing dupes. This
 * script cleans up the rows that already exist (incl. the misspelling dupes
 * the importer can't safely auto-correct).
 *
 * Run locally (DRY RUN — all gildan-source products):
 *   pnpm --filter backend exec medusa exec src/scripts/dedupe-gildan-colour-variants.ts
 * Apply:
 *   pnpm --filter backend exec medusa exec src/scripts/dedupe-gildan-colour-variants.ts -- --apply
 * One product:
 *   GILDAN_DEDUPE_HANDLES=comfort-colors-1717 \
 *     pnpm --filter backend exec medusa exec src/scripts/dedupe-gildan-colour-variants.ts
 *
 * Production (Fly):
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/dedupe-gildan-colour-variants.js -- --apply
 *
 * Flags / env:
 *   --apply        | GILDAN_DEDUPE_APPLY=1     persist changes (otherwise dry run)
 *   --handles=…    | GILDAN_DEDUPE_HANDLES=…   restrict to specific handles (CSV)
 *   --all-source   | GILDAN_DEDUPE_ALL_SOURCE=1  scan EVERY product, not just
 *                                                metadata.source=gildan
 *
 * After applying, purge the storefront product cache (HARD RULE 6):
 *   POST {storefront}/api/revalidate-products  Authorization: Bearer $REVALIDATE_SECRET
 *   body {"tags":["products"]}
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  deleteProductVariantsWorkflow,
  updateProductOptionsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

const COLOUR_OPTION_RE = /colou?r/i
const SIZE_OPTION_RE = /size/i

const flagOn = (
  args: string[] | undefined,
  flag: string,
  ...envs: string[]
): boolean =>
  (args ?? []).includes(flag) ||
  envs.some((e) => process.env[e] === "1" || process.env[e] === "true")

type OptVal = { value: string | null }
type Opt = { id: string; title: string | null; values?: OptVal[] }
type VariantOpt = { value: string | null; option: { title: string } | null }
type Variant = { id: string; sku: string | null; options?: VariantOpt[] }
type Product = {
  id: string
  handle: string
  options: Opt[]
  variants: Variant[]
}

/** Case/whitespace fold — mirrors importer's canonicalColourKey. */
const foldKey = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, " ")

const hasLower = (s: string): boolean => /[a-z]/.test(s)

/**
 * True when two SKUs are the same colour in different sizes: they share a
 * ≥5-char prefix and differ only in the trailing ≤3 chars (the size segment).
 * Gildan SKUs embed the colour CODE in that shared prefix, so a match is
 * conclusive — two genuinely different colours have different codes and so
 * diverge before the size segment. Conservative for non-Gildan formats: a
 * longer/leading size code simply fails the ≤3 test → no merge (never a false
 * positive, at worst a missed misspelling merge).
 */
const sameColourBySku = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false
  const n = Math.min(a.length, b.length)
  let lcp = 0
  while (lcp < n && a[lcp] === b[lcp]) lcp++
  return lcp >= 5 && a.length - lcp <= 3 && b.length - lcp <= 3
}

const colourOfVariant = (v: Variant): string | null => {
  for (const o of v.options ?? []) {
    if (o.option && COLOUR_OPTION_RE.test(o.option.title ?? "")) {
      const val = (o.value ?? "").trim()
      if (val) return val
    }
  }
  return null
}

const sizeOfVariant = (v: Variant): string | null => {
  for (const o of v.options ?? []) {
    if (o.option && SIZE_OPTION_RE.test(o.option.title ?? "")) {
      const val = (o.value ?? "").trim()
      if (val) return val
    }
  }
  return null
}

/** Build the full {optionTitle: value} map for a variant, swapping only the
 *  colour entry to `canonical`. Preserves every other option exactly so the
 *  re-point can't drop Size (or any future option). */
const variantOptionsWithColour = (
  v: Variant,
  canonical: string
): Record<string, string> => {
  const opts: Record<string, string> = {}
  for (const o of v.options ?? []) {
    const t = o.option?.title
    if (!t) continue
    opts[t] = COLOUR_OPTION_RE.test(t) ? canonical : (o.value ?? "")
  }
  return opts
}

type Cluster = { values: string[] }

/** Union-find over a product's colour values → clusters of "same colour". */
function clusterColours(
  values: string[],
  variantsByValue: Map<string, Variant[]>
): Cluster[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    // path-compress
    let c = x
    while (parent.get(c) !== r) {
      const next = parent.get(c)!
      parent.set(c, r)
      c = next
    }
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const v of values) parent.set(v, v)

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i]!
      const b = values[j]!
      if (find(a) === find(b)) continue
      if (foldKey(a) === foldKey(b)) {
        union(a, b)
        continue
      }
      // Shared SKU stem (cross every pair of variants).
      const va = variantsByValue.get(a) ?? []
      const vb = variantsByValue.get(b) ?? []
      let matched = false
      for (const x of va) {
        for (const y of vb) {
          if (sameColourBySku(x.sku, y.sku)) {
            matched = true
            break
          }
        }
        if (matched) break
      }
      if (matched) union(a, b)
    }
  }

  const groups = new Map<string, string[]>()
  for (const v of values) {
    const r = find(v)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(v)
  }
  return Array.from(groups.values()).map((vs) => ({ values: vs }))
}

export default async function dedupeGildanColourVariants({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const apply = flagOn(args, "--apply", "GILDAN_DEDUPE_APPLY")
  const allSource = flagOn(args, "--all-source", "GILDAN_DEDUPE_ALL_SOURCE")
  const handlesArg = (args ?? []).find((a) => a.startsWith("--handles="))
  const handlesRaw =
    (handlesArg ? handlesArg.split("=")[1] : undefined) ||
    process.env.GILDAN_DEDUPE_HANDLES ||
    ""
  const handleFilter = handlesRaw
    ? handlesRaw.split(",").map((h) => h.trim()).filter(Boolean)
    : null

  logger.info(
    `Gildan colour de-dupe — ${apply ? "APPLY" : "DRY RUN"} — scope: ${
      handleFilter
        ? handleFilter.join(",")
        : allSource
          ? "ALL products"
          : "metadata.source=gildan"
    }`
  )

  const fields = [
    "id",
    "handle",
    "options.id",
    "options.title",
    "options.values.value",
    "variants.id",
    "variants.sku",
    "variants.options.value",
    "variants.options.option.title",
  ]

  let products: Product[]
  if (handleFilter) {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { handle: handleFilter },
      pagination: { take: 5000 },
    })
    products = (data ?? []) as Product[]
  } else {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: allSource ? {} : ({ metadata: { source: "gildan" } } as any),
      pagination: { take: 10000 },
    })
    products = (data ?? []) as Product[]
  }
  logger.info(`Loaded ${products.length} product(s) to inspect.`)

  let productsChanged = 0
  let variantsRepointed = 0
  let variantsDeleted = 0
  let valuesPruned = 0
  const skippedWouldEmpty: string[] = []

  for (const p of products) {
    const colourOption = p.options.find((o) => COLOUR_OPTION_RE.test(o.title ?? ""))
    if (!colourOption) continue

    // All colour option values present on the option (incl. zero-variant ones).
    const allValues = Array.from(
      new Set(
        (colourOption.values ?? [])
          .map((v) => (v.value ?? "").trim())
          .filter(Boolean)
      )
    )
    if (allValues.length < 2) continue

    // Variants grouped by their exact colour value string.
    const variantsByValue = new Map<string, Variant[]>()
    for (const v of allValues) variantsByValue.set(v, [])
    for (const v of p.variants) {
      const c = colourOfVariant(v)
      if (c && variantsByValue.has(c)) variantsByValue.get(c)!.push(v)
    }

    const clusters = clusterColours(allValues, variantsByValue)

    const repoints: Array<{ id: string; options: Record<string, string> }> = []
    const deletes: string[] = []
    const prune = new Set<string>()
    const keep: string[] = []
    const log: string[] = []

    for (const cluster of clusters) {
      const counts = cluster.values.map((val) => ({
        val,
        n: (variantsByValue.get(val) ?? []).length,
      }))
      const maxN = Math.max(...counts.map((c) => c.n))

      if (maxN === 0) {
        // Entire cluster is phantom (no purchasable variant anywhere) — prune all.
        for (const c of counts) prune.add(c.val)
        log.push(`phantom (0 variants): ${cluster.values.join(", ")}`)
        continue
      }

      if (cluster.values.length === 1) {
        keep.push(cluster.values[0]!)
        continue
      }

      // Canonical = most variants; tiebreak: prefer a value with a lowercase
      // letter (proper case over ALL CAPS), then first seen.
      const canonical = counts
        .slice()
        .sort((a, b) =>
          b.n - a.n ||
          Number(hasLower(b.val)) - Number(hasLower(a.val)) ||
          allValues.indexOf(a.val) - allValues.indexOf(b.val)
        )[0]!.val
      keep.push(canonical)

      const canonicalSizes = new Set(
        (variantsByValue.get(canonical) ?? [])
          .map((v) => sizeOfVariant(v))
          .filter(Boolean) as string[]
      )

      for (const c of counts) {
        if (c.val === canonical) continue
        prune.add(c.val)
        for (const v of variantsByValue.get(c.val) ?? []) {
          const size = sizeOfVariant(v)
          if (size && canonicalSizes.has(size)) {
            // Canonical already carries this size → redundant duplicate SKU.
            deletes.push(v.id)
          } else {
            repoints.push({
              id: v.id,
              options: variantOptionsWithColour(v, canonical),
            })
            if (size) canonicalSizes.add(size)
          }
        }
      }
      const strays = cluster.values.filter((v) => v !== canonical)
      log.push(`merge [${strays.join(", ")}] → "${canonical}"`)
    }

    if (prune.size === 0) continue

    const remaining = allValues.filter((v) => !prune.has(v))
    if (remaining.length === 0) {
      skippedWouldEmpty.push(`${p.handle} (all ${allValues.length} colours would be pruned)`)
      logger.warn(`  ${p.handle}: would empty colours — SKIPPING (manual review)`)
      continue
    }

    logger.info(
      `  ${p.handle}: ${log.join("; ")} | re-point ${repoints.length}, delete ${deletes.length}, prune ${prune.size} value(s); ${remaining.length} colours remain`
    )

    if (!apply) continue

    try {
      if (repoints.length) {
        await updateProductVariantsWorkflow(container).run({
          input: { product_variants: repoints },
        })
        variantsRepointed += repoints.length
      }
      if (deletes.length) {
        await deleteProductVariantsWorkflow(container).run({
          input: { ids: deletes },
        })
        variantsDeleted += deletes.length
      }
      // Prune AFTER variants are moved/removed, so no pruned value still has
      // a variant attached.
      await updateProductOptionsWorkflow(container).run({
        input: {
          selector: { id: colourOption.id },
          update: { values: remaining },
        },
      })
      valuesPruned += prune.size
      productsChanged++
    } catch (e: any) {
      logger.warn(`    failed for ${p.handle}: ${e?.message ?? e}`)
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Products inspected:   ${products.length}`)
  logger.info(
    `Products changed:     ${productsChanged}${apply ? "" : " (dry run — no writes)"}`
  )
  logger.info(`Variants re-pointed:  ${variantsRepointed}${apply ? "" : " (dry run)"}`)
  logger.info(`Variants deleted:     ${variantsDeleted}${apply ? "" : " (dry run)"}`)
  logger.info(`Colour values pruned: ${valuesPruned}${apply ? "" : " (dry run)"}`)
  if (skippedWouldEmpty.length) {
    logger.warn(
      `Skipped (would empty product): ${skippedWouldEmpty.length}\n  - ${skippedWouldEmpty.join("\n  - ")}`
    )
  }
  if (apply) {
    logger.info(
      'Done. Purge the storefront cache: POST {storefront}/api/revalidate-products (Bearer REVALIDATE_SECRET, body {"tags":["products"]}).'
    )
  }
}

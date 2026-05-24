/**
 * FashionBiz price diagnostic — read-only.
 *
 * Fetches a configurable list of biz-collection (or other brand) slugs via
 * the FashionBiz API and dumps everything price-related side-by-side so we
 * can see why the importer is producing under-cost retail ladders.
 *
 * For each slug it shows:
 *   - the full `prices[]` array (tier label + price)
 *   - `public_price` and `subdomain_price` (single-number fields the
 *     importer currently ignores)
 *   - what `resolveFashionBizCost` returns with adjustment 1.0 and 1.15
 *   - the resulting `tier_100_plus` retail price under both adjustments
 *
 * Talks to the FashionBiz API client directly using env-resolved credentials
 * so it does NOT depend on the FashionBiz module being registered (the module
 * only loads when FASHIONBIZ_API_TOKEN is in backend/.env, but the diagnostic
 * needs to be runnable from a fresh shell with the token exported inline).
 *
 * Usage:
 *   FASHIONBIZ_API_TOKEN=xxx pnpm medusa exec src/scripts/diag-fashionbiz-prices.ts
 *   DIAG_SLUGS=t701ms,p700ms,p400ms,sw5ms pnpm medusa exec src/scripts/diag-fashionbiz-prices.ts
 *   DIAG_BRAND=syzmik DIAG_SLUGS=zw123 pnpm medusa exec src/scripts/diag-fashionbiz-prices.ts
 *
 * Env vars:
 *   FASHIONBIZ_API_TOKEN — required (same value the production module uses)
 *   FASHIONBIZ_BRANCH    — au|nz|ca (default: au)
 *   FASHIONBIZ_BASE_URL  — override default (https://www.fashionbizapis.com/api/v3)
 *   DIAG_BRAND           — FashionBiz brand slug (default: biz-collection)
 *   DIAG_SLUGS           — comma-separated product slugs to inspect
 *                          (default: t701ms,p700ms,p400ms — the Tee user
 *                           flagged, matching Polo, and the known-good
 *                           Crew Polo)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { FashionBizClient } from "../modules/fashionbiz/client"
import {
  FashionBizBranch,
  FashionBizBrandSlug,
  FashionBizProduct,
} from "../modules/fashionbiz/types"
import { resolveFashionBizCost } from "../modules/fashionbiz/pricing"
import { buildPriceLadder } from "../utils/bulk-price-ladder"

const DEFAULT_SLUGS = ["t701ms", "p700ms", "p400ms"]
const DEFAULT_BRAND: FashionBizBrandSlug = "biz-collection"

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "—"
  return `$${(n as number).toFixed(2)}`
}

function dumpProduct(p: FashionBizProduct, slug: string): void {
  console.log(`\n=== ${slug.toUpperCase()} — ${p.name ?? "(no name)"} ===`)
  console.log(`  code:             ${p.code}`)
  console.log(`  sales_status:     ${p.sales_status ?? "—"}`)
  console.log(`  public_price:     ${fmt(p.public_price)}`)
  console.log(`  subdomain_price:  ${fmt(p.subdomain_price)}`)
  console.log(`  prices[] (${p.prices?.length ?? 0} tier${p.prices?.length === 1 ? "" : "s"}):`)
  for (const tier of p.prices ?? []) {
    console.log(`     - tier=${JSON.stringify(tier.tier)}  price=${fmt(tier.price)}`)
  }

  const cost10 = resolveFashionBizCost(p.prices, 1.0)
  const cost15 = resolveFashionBizCost(p.prices, 1.15)
  const ladder10 = cost10 !== null ? buildPriceLadder(cost10) : null
  const ladder15 = cost15 !== null ? buildPriceLadder(cost15) : null

  console.log(`  Importer-derived cost (×1.00 adj):  ${fmt(cost10)}`)
  console.log(`     → resulting tier_100_plus:        ${fmt(ladder10?.tier100Plus)}`)
  console.log(`     → resulting base/standard:        ${fmt(ladder10?.base)}`)
  console.log(`  Importer-derived cost (×1.15 adj):  ${fmt(cost15)}`)
  console.log(`     → resulting tier_100_plus:        ${fmt(ladder15?.tier100Plus)}`)
  console.log(`     → resulting base/standard:        ${fmt(ladder15?.base)}`)

  if (p.subdomain_price && p.subdomain_price > 0) {
    const sdLadder = buildPriceLadder(p.subdomain_price)
    console.log(`  If we used subdomain_price as cost:`)
    console.log(`     → resulting tier_100_plus:        ${fmt(sdLadder.tier100Plus)}`)
    console.log(`     → resulting base/standard:        ${fmt(sdLadder.base)}`)

    const tier1to99 = p.prices?.find((t) => t.tier?.trim() === "1-99")
    if (tier1to99 && tier1to99.price > 0) {
      const ratio = p.subdomain_price / tier1to99.price
      console.log(
        `  subdomain_price / prices[1-99] ratio: ${ratio.toFixed(4)} ` +
          `(documented norm: 1.15 — anything higher means the 1-99 tier is ` +
          `materially below what FashionBiz actually bills SC Prints)`
      )
    }
  }
}

export default async function diagFashionBizPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const token = process.env.FASHIONBIZ_API_TOKEN
  if (!token) {
    logger.error(
      "FASHIONBIZ_API_TOKEN not set. Run with `FASHIONBIZ_API_TOKEN=<token> pnpm medusa exec src/scripts/diag-fashionbiz-prices.ts` or add it to backend/.env."
    )
    return
  }

  const branch = (process.env.FASHIONBIZ_BRANCH ?? "au") as FashionBizBranch
  const baseUrl =
    process.env.FASHIONBIZ_BASE_URL ?? "https://www.fashionbizapis.com/api/v3"
  const client = new FashionBizClient({ token, branch, base_url: baseUrl })

  const brand = (process.env.DIAG_BRAND ?? DEFAULT_BRAND) as FashionBizBrandSlug
  const slugs = (process.env.DIAG_SLUGS ?? DEFAULT_SLUGS.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  console.log(
    `\nFashionBiz price diagnostic — brand=${brand}, branch=${branch}, slugs=[${slugs.join(", ")}]`
  )
  console.log(
    `(adjustments shown below are hypothetical — env FASHIONBIZ_COST_ADJUSTMENT not read here)\n`
  )

  for (const slug of slugs) {
    try {
      const detail = await client.getProductDetail(brand, slug)
      dumpProduct(detail, slug)
    } catch (err: any) {
      console.log(`\n=== ${slug.toUpperCase()} — FETCH FAILED ===`)
      console.log(`  error: ${err?.message ?? err}`)
    }
  }

  console.log("\nDone.\n")
}

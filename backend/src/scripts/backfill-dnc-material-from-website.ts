/**
 * Backfill DNC Workwear product.material by scraping dncworkwear.com.au.
 *
 * Unlike Aussie Pacific and Ramo (where fabric is embedded in the description),
 * DNC's import CSV has no fabric column AND descriptions are empty. The only
 * source is the public product page on dncworkwear.com.au. Each product code
 * (e.g. "1101") has a page at /Product/1101 that contains a fabric block like:
 *
 *   <p><strong>Fabric:</strong></span> 200gsm, 65% Polyester, 35% Cotton</p>
 *
 * Approach:
 *   1. Walk all published DNC products
 *   2. Extract the code from the handle (`dnc-1101` → `1101`)
 *   3. Fetch the product page with throttling (~500ms between requests)
 *   4. Apply a robust extractor across the known HTML patterns
 *   5. Write the result to product.material
 *
 * Coverage from sampling: ~90% (some products are removed from DNC's site).
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-dnc-material-from-website.ts
 *   # or with throttle override (default 500ms):
 *   DNC_THROTTLE_MS=300 npx medusa exec src/scripts/...
 *
 * After running, trigger `reindex-meilisearch.js`.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { cleanMaterialString } from "../lib/material-text"

const BATCH = 200
const DEFAULT_THROTTLE_MS = 500
const USER_AGENT =
  "Mozilla/5.0 (compatible; SCPrintsCatalogSync/1.0; +mailto:info@scprints.com.au)"

/** Pages smaller than this are "product not found" placeholders. */
const MIN_REAL_PAGE_BYTES = 30000

const FABRIC_KEYWORDS_RE = /(gsm|cotton|polyester|nylon|wool|fabric|%|cordura|pvc|spandex|elastane)/i

/**
 * Robust extractor that handles the small variations DNC's CMS produces:
 *   - <strong>Fabric:</strong></span> CONTENT</p>   (colon inside strong, with span wrapper)
 *   - <strong>Fabric</strong>: CONTENT</p>          (colon outside strong)
 *   - Fabric: CONTENT</p>                            (no styling at all)
 */
export function extractDncFabricFromHtml(html: string | null | undefined): string | null {
  if (!html || html.length < MIN_REAL_PAGE_BYTES) return null

  const patterns: RegExp[] = [
    /<strong>\s*Fabric\s*:?\s*<\/strong>\s*(?:<\/span>)?\s*:?\s*(.+?)<\/p>/is,
    /Fabric\s*<\/strong>\s*:\s*(.+?)<\/p>/is,
    /Fabric\s*:\s*<\/strong>\s*(?:<\/span>)?\s*(.+?)<\/p>/is,
    />Fabric[\s<\/strong]*:\s*(.+?)<\/p>/is,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (!m) continue
    let text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    // Strip leading/trailing punctuation
    text = text.replace(/^[\s,.:;"'\-]+|[\s,.:;"'\-]+$/g, "")
    if (text && text.length < 300 && FABRIC_KEYWORDS_RE.test(text)) {
      // Drop trailing spec/feature prose ("Wash-n-wear", "Size: ...", etc.)
      return cleanMaterialString(text)
    }
  }
  return null
}

async function fetchPage(code: string, signal: AbortSignal): Promise<string | null> {
  const url = `https://www.dncworkwear.com.au/Product/${encodeURIComponent(code)}`
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default async function backfillDncMaterial({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  const throttleMs = Number(process.env.DNC_THROTTLE_MS) || DEFAULT_THROTTLE_MS

  logger.info(
    `[dnc-material] Starting (dry_run=${dryRun}, throttle=${throttleMs}ms, user-agent="${USER_AGENT.slice(0, 50)}...")`
  )

  // 1) Collect all DNC products that still need material
  type Pending = { id: string; handle: string; code: string }
  const pending: Pending[] = []
  let offset = 0
  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "material", "brand.handle"],
      pagination: { take: BATCH, skip: offset },
      filters: { status: "published" },
    })
    if (!products.length) break
    for (const p of products as any[]) {
      const brand = Array.isArray(p.brand) ? p.brand[0] : p.brand
      if (brand?.handle !== "dnc-workwear") continue
      if (p.material && typeof p.material === "string" && p.material.trim()) continue
      const handle: string = p.handle ?? ""
      const code = handle.replace(/^dnc-/i, "").toUpperCase()
      if (!code) continue
      pending.push({ id: p.id, handle, code })
    }
    offset += products.length
    if (products.length < BATCH) break
  }

  logger.info(`[dnc-material] Found ${pending.length} DNC products needing material`)

  if (pending.length === 0) {
    logger.info("[dnc-material] Nothing to do")
    return
  }

  // 2) Throttled fetch + extract loop
  const controller = new AbortController()
  let updated = 0
  let dead = 0
  let no_fabric = 0
  let fetch_errs = 0

  for (let i = 0; i < pending.length; i++) {
    const { id, code, handle } = pending[i]
    const html = await fetchPage(code, controller.signal)
    if (html === null) {
      fetch_errs++
      logger.warn(`[dnc-material] [${i + 1}/${pending.length}] ${handle}: fetch failed`)
      await sleep(throttleMs)
      continue
    }
    if (html.length < MIN_REAL_PAGE_BYTES) {
      dead++
      logger.warn(`[dnc-material] [${i + 1}/${pending.length}] ${handle}: dead page (${html.length}b)`)
      await sleep(throttleMs)
      continue
    }

    const fabric = extractDncFabricFromHtml(html)
    if (!fabric) {
      no_fabric++
      logger.warn(`[dnc-material] [${i + 1}/${pending.length}] ${handle}: no fabric found`)
      await sleep(throttleMs)
      continue
    }

    logger.info(`[dnc-material] [${i + 1}/${pending.length}] ${handle}: "${fabric.slice(0, 80)}"`)
    if (!dryRun) {
      try {
        await productModule.updateProducts(id, { material: fabric })
        updated++
      } catch (e: any) {
        logger.error(`[dnc-material] update failed for ${handle}: ${e?.message}`)
      }
    } else {
      updated++
    }

    // Log progress every 25 products
    if ((i + 1) % 25 === 0) {
      logger.info(
        `[dnc-material] progress: ${i + 1}/${pending.length} (updated=${updated}, dead=${dead}, no_fabric=${no_fabric}, fetch_errs=${fetch_errs})`
      )
    }

    await sleep(throttleMs)
  }

  logger.info(
    `[dnc-material] Done — updated=${updated}, dead_pages=${dead}, no_fabric=${no_fabric}, fetch_errs=${fetch_errs} (dry_run=${dryRun})`
  )
}

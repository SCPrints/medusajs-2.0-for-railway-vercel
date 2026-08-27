/**
 * Stamp `metadata.size_guide` on supplier catalogs from their APIs:
 *
 *  - AS COLOUR: the catalog API exposes a per-style `sizeGuideURL` (JPG on
 *    their BigCommerce CDN). HEAD-validated before stamping (that CDN's
 *    metadata is known to rot — see the image hard rules); dead/missing
 *    guides are skipped and logged.
 *  - FASHIONBIZ (Biz Collection / Biz Care / Biz Corporates / Syzmik): the
 *    v3 product-detail API returns structured `size_charts`
 *    ({ measurement, size_details: [{key, value, position}] }) — rendered as
 *    a measurements TABLE by the storefront SizeGuide component.
 *
 * Both add a "Fit: X" tip when the API supplies a fit. Aussie Pacific,
 * Gildan, Ramo and DNC expose no size data via their sources — those need
 * per-site scrapers (future work). Shaka Wear is stamped separately
 * (stamp-shaka-size-guides.ts) and is not touched here.
 *
 * Usage:
 *   # Prod:  cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/stamp-supplier-size-guides.js
 *            (re-run without IMPORT_DRY_RUN to write)
 *   ONLY_SOURCE=ascolour|fashionbiz  — restrict to one supplier.
 *   IMPORT_LIMIT=N                   — cap products per supplier (testing).
 *
 * Idempotent: skips products whose stamped block already matches.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import type AsColourService from "../modules/ascolour/service"
import { FASHIONBIZ_MODULE } from "../modules/fashionbiz"
import type FashionBizService from "../modules/fashionbiz/service"
import type { FashionBizBrandSlug } from "../modules/fashionbiz/types"
import { checkImageUrl } from "../services/image-audit/check"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"

type SizeGuide = {
  images?: string[]
  tips?: string[]
  table?: { header: string[]; rows: string[][] }
}

type ProductRow = {
  id: string
  handle: string
  metadata: Record<string, any> | null
}

const fitTip = (fit: unknown): string[] => {
  if (typeof fit !== "string" || !fit.trim()) return []
  const f = fit.trim()
  return [/fit/i.test(f) ? `Fit: ${f}` : `Fit: ${f} fit`]
}

/** FashionBiz size_charts → { header, rows }. Returns null when unusable. */
export function buildFashionBizTable(
  sizeCharts: unknown
): { header: string[]; rows: string[][] } | null {
  if (!Array.isArray(sizeCharts) || !sizeCharts.length) return null
  const sizeOrder: string[] = []
  const charts: Array<{ measurement: string; values: Map<string, string> }> = []
  for (const raw of sizeCharts) {
    const chart = raw as {
      measurement?: unknown
      size_details?: Array<{ key?: unknown; value?: unknown; position?: unknown }>
    }
    if (typeof chart?.measurement !== "string" || !Array.isArray(chart.size_details)) continue
    const details = [...chart.size_details]
      .filter((d) => typeof d?.key === "string" && d.key.trim())
      .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    if (!details.length) continue
    const values = new Map<string, string>()
    for (const d of details) {
      const key = (d.key as string).trim()
      if (!sizeOrder.includes(key)) sizeOrder.push(key)
      values.set(key, String(d.value ?? "").trim())
    }
    charts.push({ measurement: chart.measurement.trim(), values })
  }
  if (!charts.length || !sizeOrder.length) return null
  return {
    header: ["", ...sizeOrder],
    rows: charts.map((c) => [c.measurement, ...sizeOrder.map((s) => c.values.get(s) ?? "")]),
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
      while (i < items.length) await fn(items[i++])
    })
  )
}

export default async function run({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.IMPORT_DRY_RUN === "1"
  const only = process.env.ONLY_SOURCE
  const limit = process.env.IMPORT_LIMIT ? Number.parseInt(process.env.IMPORT_LIMIT, 10) : Infinity

  // Walk the whole catalog once; bucket by supplier linkage in metadata.
  const ascolourRows: ProductRow[] = []
  const fashionbizRows: ProductRow[] = []
  const PAGE = 500
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata"],
      pagination: { skip: offset, take: PAGE },
    })
    const rows = (data ?? []) as ProductRow[]
    for (const p of rows) {
      if (p.metadata?.ascolour?.styleCode) ascolourRows.push(p)
      else if (p.metadata?.fashionbiz?.slug && p.metadata?.fashionbiz?.brand_slug)
        fashionbizRows.push(p)
    }
    if (rows.length < PAGE) break
  }
  logger.info(
    `supplier-size-guides: catalog scan — ${ascolourRows.length} AS Colour, ${fashionbizRows.length} FashionBiz products`
  )

  let stamped = 0
  let skipped = 0
  let unchanged = 0

  const stamp = async (row: ProductRow, size_guide: SizeGuide, label: string) => {
    const meta = row.metadata ?? {}
    if (JSON.stringify(meta.size_guide) === JSON.stringify(size_guide)) {
      unchanged++
      return
    }
    if (!dryRun) {
      // read-modify-write: Medusa metadata updates REPLACE the whole jsonb
      await productModule.updateProducts(row.id, { metadata: { ...meta, size_guide } })
    }
    stamped++
    logger.info(`supplier-size-guides ${label}${dryRun ? " (dry-run)" : ""}: stamped ${row.handle}`)
  }

  // ---- AS COLOUR ----
  if (!only || only === "ascolour") {
    let ascolour: AsColourService | null = null
    try {
      ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService
    } catch {
      logger.warn("supplier-size-guides: AS Colour module not registered — skipping")
    }
    if (ascolour) {
      const apiProducts = await ascolour.fetchAllProducts()
      const byStyle = new Map<string, any>()
      for (const p of apiProducts) byStyle.set(String((p as any).styleCode), p)
      const targets = ascolourRows.slice(0, limit)
      const urlLiveness = new Map<string, boolean>()
      await mapPool(targets, 6, async (row) => {
        const api = byStyle.get(String(row.metadata!.ascolour.styleCode))
        const url = api?.sizeGuideURL
        if (typeof url !== "string" || !url.startsWith("http")) {
          skipped++
          return
        }
        if (!urlLiveness.has(url)) {
          const res = await checkImageUrl(url, 12000)
          urlLiveness.set(url, res.ok)
        }
        if (!urlLiveness.get(url)) {
          skipped++
          logger.warn(`supplier-size-guides ascolour: dead sizeGuideURL for ${row.handle} — skipped`)
          return
        }
        await stamp(row, { images: [url], tips: fitTip(api?.fit) }, "ascolour")
      })
    }
  }

  // ---- FASHIONBIZ ----
  if (!only || only === "fashionbiz") {
    let fashionbiz: FashionBizService | null = null
    try {
      fashionbiz = container.resolve(FASHIONBIZ_MODULE) as FashionBizService
    } catch {
      logger.warn("supplier-size-guides: FashionBiz module not registered — skipping")
    }
    if (fashionbiz) {
      const targets = fashionbizRows.slice(0, limit)
      await mapPool(targets, 4, async (row) => {
        const fb = row.metadata!.fashionbiz
        let detail: any
        try {
          detail = await fashionbiz!.fetchProductDetail(
            fb.brand_slug as FashionBizBrandSlug,
            fb.slug
          )
        } catch (e: any) {
          skipped++
          logger.warn(
            `supplier-size-guides fashionbiz: detail fetch failed for ${row.handle} (${e?.message}) — skipped`
          )
          return
        }
        const table = buildFashionBizTable(detail?.size_charts)
        if (!table) {
          skipped++
          return
        }
        await stamp(row, { tips: fitTip(detail?.fit ?? fb.fit), table }, "fashionbiz")
      })
    }
  }

  logger.info(
    `supplier-size-guides${dryRun ? " (dry-run)" : ""}: ${stamped} stamped, ${unchanged} unchanged, ${skipped} skipped (no/dead data)`
  )
  if (stamped > 0 && !dryRun) {
    const purged = await revalidateStorefrontTags(["products"], logger)
    logger.info(`supplier-size-guides: storefront cache purge ${purged ? "ok" : "skipped/failed"}`)
  }
}

/**
 * Stamp `metadata.garment_fit` on every product: the reference size (M) body
 * width from the brand's own size data, the body width measured off the
 * product's flat-lay photos, and the resulting `mockup_scale` the Studio uses
 * to draw prints at true size on the mockup. See lib/garment-fit.ts.
 *
 * Body-width sources, first hit wins:
 *  1. metadata.size_guide.table   — FashionBiz (stamped by stamp-supplier-size-guides)
 *  2. metadata.size_guide.images  — AS Colour + Shaka chart images, read by Claude
 *                                   (needs ANTHROPIC_API_KEY; one call per distinct chart)
 *  3. Gildan / American Apparel / Comfort Colors — gildanbrands.com.au/content/sizing_chart.csv
 *  4. Aussie Pacific — the Kiwi Sizing chart behind aussiepacific.com.au product pages
 *  5. JB's Wear — the sizing table on jbswear.com.au/product-detail/-in-product/<style>
 *  6. DNC — DNC's one-chart-per-garment-type (lib/garment-fit DNC_HALF_CHEST)
 *  7. Typical width for the garment type (Ramo, anything else)
 *
 * A row with `garment_fit.source = "manual"` is never touched (staff override).
 *
 * Usage (prod): cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/stamp-garment-fit.js
 *   DRY_RUN=1          log only, no writes
 *   HANDLES=a,b        only these product handles
 *   ONLY_SOURCE=gildan size_guide | chart_image | gildan | aussiepacific | jbs | dnc | type_default
 *   IMPORT_LIMIT=N     cap products processed
 * Idempotent: rewrites only when the result changed (ignoring measured_at).
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  chartBodyWidth,
  GarmentFit,
  measurePhotoBodyRatio,
  median,
  mockupScaleFor,
  parseGildanSizingCsv,
  parseHtmlSizeTable,
  parseKiwiSizing,
  readSizeChartImage,
  SizeTable,
  SLEEVES_MAY_HIDE_BODY,
  sleeveSafeRatio,
  widthFromTable,
} from "../lib/garment-fit"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"

type Row = {
  id: string
  handle: string
  title: string | null
  thumbnail: string | null
  metadata: Record<string, any> | null
  type?: { value?: string } | null
  tags?: Array<{ value?: string }> | null
  images?: Array<{ url?: string }> | null
  brand?: { handle?: string } | null
}

type Width = { reference_size: string; body_width_cm: number; source: string }

const UA = "Mozilla/5.0 (compatible; SC-Prints-Importer/1.0; +https://scprints.com.au)"
const MAX_PHOTOS = 6

async function get(url: string, timeoutMs = 15000): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) })
    return res.ok ? res : null
  } catch {
    return null
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

/** Cache a promise per key so concurrent workers share one fetch. */
const memo = <T>() => {
  const m = new Map<string, Promise<T>>()
  return (key: string, fn: () => Promise<T>) => {
    if (!m.has(key)) m.set(key, fn().catch(() => null as T))
    return m.get(key)!
  }
}

export default async function run({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.DRY_RUN === "1"
  const only = process.env.ONLY_SOURCE
  const handles = process.env.HANDLES?.split(",").map((h) => h.trim()).filter(Boolean)
  const limit = process.env.IMPORT_LIMIT ? Number.parseInt(process.env.IMPORT_LIMIT, 10) : Infinity
  const apiKey = process.env.ANTHROPIC_API_KEY

  const rows: Row[] = []
  for (let skip = 0; ; skip += 500) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "title", "thumbnail", "metadata", "type.value", "tags.value", "images.url", "brand.handle"],
      filters: handles?.length ? { handle: handles } : {},
      pagination: { skip, take: 500 },
    })
    rows.push(...((data ?? []) as Row[]))
    if ((data ?? []).length < 500) break
  }
  const targets = rows.filter((r) => r.metadata?.garment_fit?.source !== "manual").slice(0, limit)
  logger.info(`garment-fit: ${targets.length} products to process${dryRun ? " (dry-run)" : ""}`)

  // ---- shared supplier data, fetched once ----
  const once = memo<any>()
  const gildanCsv = () =>
    once("gildan", async () => {
      const res = await get("https://gildanbrands.com.au/content/sizing_chart.csv")
      return res ? parseGildanSizingCsv(await res.text()) : new Map<string, SizeTable>()
    }) as Promise<Map<string, SizeTable>>
  const apProductIds = () =>
    once("ap", async () => {
      // style code → Shopify product id. Only the plain style listing
      // ("cottesloe-kids-polos-3319") carries the Kiwi chart; per-colour and
      // runout listings don't — so keep the shortest non-runout handle.
      const map = new Map<string, { id: number; handle: string }>()
      for (let page = 1; page <= 60; page++) {
        const res = await get(`https://www.aussiepacific.com.au/products.json?limit=250&page=${page}`)
        const products = res ? ((await res.json()) as { products?: Array<{ id: number; handle: string }> }).products ?? [] : []
        if (!products.length) break
        for (const p of products) {
          const code = p.handle.match(/-([a-z0-9]+)$/i)?.[1]?.toLowerCase()
          if (!code || /runout/i.test(p.handle)) continue
          const prev = map.get(code)
          if (!prev || p.handle.length < prev.handle.length) map.set(code, { id: p.id, handle: p.handle })
        }
      }
      return new Map([...map].map(([code, v]) => [code, v.id]))
    }) as Promise<Map<string, number>>
  const chartCache = memo<SizeTable | null>()
  const pageCache = memo<SizeTable | null>()

  const fromTable = (t: SizeTable | null | undefined, source: string): Width | null => {
    const w = widthFromTable(t)
    return w ? { ...w, source } : null
  }

  const resolveWidth = async (row: Row): Promise<Width | null> => {
    const meta = row.metadata ?? {}
    const brand = row.brand?.handle ?? ""
    const want = (s: string) => !only || only === s
    const info = { title: row.title, type: row.type?.value, tags: (row.tags ?? []).map((t) => t.value ?? "") }

    if (want("size_guide")) {
      const w = fromTable(meta.size_guide?.table, "size_guide")
      if (w) return w
    }
    const chartUrl = Array.isArray(meta.size_guide?.images) ? meta.size_guide.images[0] : null
    if (want("chart_image") && chartUrl && apiKey) {
      const t = await chartCache(chartUrl, () => readSizeChartImage(chartUrl, { apiKey }))
      const w = fromTable(t, "chart_image")
      if (w) return w
    }
    const gildanStyle = meta.gildan?.style_parent
    if (want("gildan") && gildanStyle) {
      const w = fromTable((await gildanCsv()).get(String(gildanStyle).toUpperCase()), "gildan_csv")
      if (w) return w
    }
    const apStyle = meta.aussiepacific?.style_code
    if (want("aussiepacific") && apStyle) {
      const id = (await apProductIds()).get(String(apStyle).toLowerCase())
      if (id) {
        const t = await pageCache(`ap:${id}`, async () => {
          const res = await get(`https://app.kiwisizing.com/api/getSizingChart?shop=aussiepacificretail.myshopify.com&product=${id}`)
          return res ? parseKiwiSizing(await res.json()) : null
        })
        const w = fromTable(t, "kiwi")
        if (w) return w
      }
    }
    const jbsStyle = meta.jbs_wear?.style_code
    if (want("jbs") && jbsStyle) {
      const t = await pageCache(`jbs:${jbsStyle}`, async () => {
        const res = await get(`https://www.jbswear.com.au/product-detail/-in-product/${encodeURIComponent(jbsStyle)}`)
        return res ? parseHtmlSizeTable(await res.text()) : null
      })
      const w = fromTable(t, "jbs_site")
      if (w) return w
    }
    if (want("dnc") && /dnc/i.test(brand)) {
      const w = chartBodyWidth("dnc", info)
      if (w) return { ...w, source: "dnc_chart" }
    }
    if (want("type_default")) {
      const w = chartBodyWidth("type_default", info)
      if (w) return { ...w, source: "type_default" }
    }
    return null
  }

  const measurePhotos = async (row: Row): Promise<number[]> => {
    const urls = [...new Set([row.thumbnail, ...(row.images ?? []).map((i) => i.url)].filter((u): u is string => !!u))]
    const ratios: number[] = []
    for (const url of urls.slice(0, MAX_PHOTOS)) {
      const res = await get(url, 12000)
      if (!res) continue
      try {
        const r = await measurePhotoBodyRatio(Buffer.from(await res.arrayBuffer()))
        if (r) ratios.push(r)
      } catch {
        // unreadable image — skip
      }
    }
    return ratios
  }

  const counts: Record<string, number> = {}
  let wrote = 0
  let noWidth = 0
  let noPhoto = 0
  let fromBrand = 0

  // Pass 1: width + photo reading for every product.
  type Measured = { row: Row; width: Width; ratio: number | null; samples: number; sleevesMayHide: boolean }
  const measured: Measured[] = []
  await mapPool(targets, 4, async (row) => {
    const width = await resolveWidth(row)
    if (!width) {
      noWidth++
      return
    }
    const ratios = await measurePhotos(row)
    const text = `${row.type?.value ?? ""} ${row.title ?? ""}`
    measured.push({ row, width, ratio: median(ratios), samples: ratios.length, sleevesMayHide: SLEEVES_MAY_HIDE_BODY.test(text) })
  })

  // Pass 2: each brand's typical short-sleeve photo reading (same supplier = same framing).
  const brandSamples = new Map<string, number[]>()
  for (const m of measured) {
    if (m.sleevesMayHide || m.ratio == null || !m.row.brand?.handle) continue
    brandSamples.set(m.row.brand.handle, [...(brandSamples.get(m.row.brand.handle) ?? []), m.ratio])
  }
  const brandMedian = (handle?: string) => {
    const xs = handle ? brandSamples.get(handle) ?? [] : []
    return xs.length >= 5 ? median(xs) : null
  }

  // Pass 3: build + write.
  for (const m of measured) {
    const { row, width } = m
    const photo = m.sleevesMayHide
      ? sleeveSafeRatio(m.ratio, brandMedian(row.brand?.handle))
      : { ratio: m.ratio, from: m.ratio == null ? null : ("photo" as const) }
    if (photo.from === "brand_median") fromBrand++
    const fit: GarmentFit = {
      reference_size: width.reference_size,
      body_width_cm: width.body_width_cm,
      source: width.source,
      photo_body_ratio: photo.ratio,
      photo_samples: m.samples,
      photo_from: photo.from,
      mockup_scale: mockupScaleFor(photo.ratio, width.body_width_cm),
      measured_at: new Date().toISOString(),
    }
    counts[width.source] = (counts[width.source] ?? 0) + 1
    if (fit.mockup_scale == null) noPhoto++
    logger.info(
      `garment-fit ${row.handle}: ${fit.source} ${fit.reference_size}=${fit.body_width_cm}cm, photo ${photo.ratio ?? "—"} (${m.samples}${photo.from === "brand_median" ? ", brand median" : ""}) → scale ${fit.mockup_scale ?? "none"}`
    )

    const { measured_at: _a, ...next } = fit
    const { measured_at: _b, ...prev } = (row.metadata?.garment_fit ?? {}) as GarmentFit
    if (JSON.stringify(next) === JSON.stringify(prev)) continue
    if (!dryRun) {
      // read-modify-write: Medusa metadata updates REPLACE the whole jsonb.
      const [fresh] = await productModule.listProducts({ id: row.id }, { select: ["id", "metadata"] })
      await productModule.updateProducts(row.id, { metadata: { ...(fresh?.metadata ?? {}), garment_fit: fit } })
    }
    wrote++
  }

  logger.info(
    `garment-fit${dryRun ? " (dry-run)" : ""}: ${wrote} written; by source ${JSON.stringify(counts)}; ` +
      `${noWidth} with no width; ${noPhoto} with no usable flat-lay photo (mockup keeps today's look); ` +
      `${fromBrand} long-sleeve styles used their brand's typical photo`
  )
  if (wrote > 0 && !dryRun) {
    const purged = await revalidateStorefrontTags(["products"], logger)
    logger.info(`garment-fit: storefront cache purge ${purged ? "ok" : "skipped/failed"}`)
  }
}

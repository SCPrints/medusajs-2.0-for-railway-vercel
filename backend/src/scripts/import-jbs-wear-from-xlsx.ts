/**
 * JB's Wear catalog import — reads JB's "SKU - WEBCC Trade" xlsx (one row per
 * SKU) and creates one Medusa product per style across JB's four labels
 * (JB's Wear, Podium, Colours of Cotton, Johnny Bobbin).
 *
 * Same policy as Gildan / Shaka Wear (spreadsheet supplier, no API):
 *   - No stock data → variants are "always available" (`manage_inventory:
 *     false`), no stock location, no sync cron.
 *   - Cost is PER-SKU (bigger sizes / some colours cost more), so every
 *     variant gets its own ladder; the cheapest drives product bulk_pricing.
 *   - Images: front + back per colour from JB's Hightail pack, uploaded to R2
 *     first by upload-jbs-wear-images.ts. Where R2 has no front, the sheet's
 *     jbswear.com.au "Colour Image URL" is used (front only). Every URL is
 *     HEAD-validated before it's written.
 *   - Per-unit weight = carton gross weight ÷ carton qty (real data).
 *
 * Discontinued / clearance / sale lines are NEVER imported: list them in
 * ./jbs-wear-exclude.ts (whole style or STYLE/COLOUR) before running.
 *
 * Idempotency: create-only, keyed by handle. Existing handles are skipped.
 *
 * Usage:
 *   JBS_XLSX_PATH=/abs/path.xlsx IMPORT_DRY_RUN=1 \
 *     pnpm --filter backend medusa exec src/scripts/import-jbs-wear-from-xlsx.ts
 * Prod (Fly): `fly ssh sftp shell` → put the xlsx in /tmp, then
 *   cd /app/.medusa/server && JBS_XLSX_PATH=/tmp/jbs.xlsx npx medusa exec src/scripts/import-jbs-wear-from-xlsx.js
 *
 * Env vars:
 *   JBS_XLSX_PATH        — required (or --xlsx=/path)
 *   JBS_COST_ADJUSTMENT  — multiplier on the WEBCC Trade cost (default 1.0;
 *                          the sheet is ex-GST trade cost — confirmed 2026-10-14)
 *   IMPORT_DRY_RUN=1     — parse + validate images, no DB writes
 *   IMPORT_LIMIT=N       — cap styles processed
 *   IMPORT_STYLES=1HT,4P — only these style codes
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import * as XLSX from "xlsx"
import { BRAND_MODULE } from "../modules/brand"
import { buildPriceLadder } from "../utils/bulk-price-ladder"
import {
  ladderToTierMinor,
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../utils/bulk-tier-prices"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../lib/supplier-import-pipeline"
import {
  revalidateStorefrontTags,
  tagsForBrand,
  tagsForProduct,
} from "../lib/storefront-revalidate"
import { classifyJbsWearProduct } from "../lib/product-taxonomy"
import { checkImageUrl } from "../services/image-audit/check"
import { parseGsm } from "../utils/parse-gsm"
import {
  JBS_BRANDS,
  applyJbsExclusions,
  groupJbsRows,
  jbsImageKey,
  normaliseHeader,
  renderJbsDescription,
  type JbsRow,
  type JbsStyle,
} from "../lib/jbs-wear-catalog"
import { JBS_WEAR_EXCLUDE } from "./jbs-wear-exclude"

const PRICE_CURRENCY_CODE = "aud"
const SOURCE = "jbs-wear"
const PARENT_HANDLE = "jbs-wear"
const BATCH_SIZE = 20

export default async function importJbsWear({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const arg = (k: string) =>
    (args ?? []).find((a) => a.startsWith(`--${k}=`))?.split("=")[1]
  const xlsxPath = arg("xlsx") || process.env.JBS_XLSX_PATH
  if (!xlsxPath) throw new Error("Set JBS_XLSX_PATH (or --xlsx=/path/to/file.xlsx)")
  const dryRun =
    (args ?? []).includes("--dry-run") ||
    ["1", "true"].includes(process.env.IMPORT_DRY_RUN ?? "")
  const limit = Number.parseInt(arg("limit") ?? process.env.IMPORT_LIMIT ?? "", 10)
  const onlyStyles = new Set(
    (process.env.IMPORT_STYLES ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  )
  const costAdjustment = Number.parseFloat(process.env.JBS_COST_ADJUSTMENT ?? "1") || 1

  // --- Parse ---------------------------------------------------------------
  const wb = XLSX.readFile(xlsxPath)
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
  })
  const headers = (raw[0] ?? []).map(normaliseHeader)
  const rows: JbsRow[] = raw.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r as unknown[])[i]]))
  )
  const grouped = groupJbsRows(rows)
  const skipped = grouped.skipped
  const excluded = applyJbsExclusions(grouped.styles, JBS_WEAR_EXCLUDE)
  let styles = excluded.styles
  logger.info(
    `Excluded (discontinued/clearance list): ${excluded.removedStyles.length} styles [${excluded.removedStyles.join(", ")}], ${excluded.removedColourways.length} colourways.`
  )
  if (onlyStyles.size) styles = styles.filter((s) => onlyStyles.has(s.code.toUpperCase()))
  if (limit > 0) styles = styles.slice(0, limit)
  logger.info(
    `JB's Wear import — ${rows.length} rows → ${styles.length} styles (${skipped} rows skipped), costAdjustment=${costAdjustment}, dryRun=${dryRun}.`
  )

  // --- Skip existing handles ------------------------------------------------
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: styles.map((s) => s.handle) },
  })
  const existingHandles = new Set((existing ?? []).map((p: any) => p.handle))
  const todo = styles.filter((s) => !existingHandles.has(s.handle))
  logger.info(`${existingHandles.size} already exist, ${todo.length} to create.`)

  // --- Validate images (HEAD; only 200s are written) -------------------------
  const urls = [
    ...new Set(
      todo.flatMap((s) =>
        s.variants.flatMap((v) => [v.imageUrl, r2Url(s.code, v.colourCode, "front"), r2Url(s.code, v.colourCode, "back")])
      )
    ),
  ].filter(Boolean) as string[]
  const liveUrls = new Set<string>()
  for (let i = 0; i < urls.length; i += 8) {
    const chunk = urls.slice(i, i + 8)
    const results = await Promise.all(chunk.map((u) => checkImageUrl(u, 10_000)))
    results.forEach((r, j) => r.ok && liveUrls.add(chunk[j]))
  }
  // r2.dev rate-limits bursts — the parallel pass false-negatived ~230 live
  // shots on the first prod dry run. Re-check every miss slowly, one at a time,
  // so a throttled check never silently drops a real front/back image.
  for (const u of urls.filter((u) => !liveUrls.has(u))) {
    await new Promise((r) => setTimeout(r, 150))
    if ((await checkImageUrl(u, 15_000)).ok) liveUrls.add(u)
  }
  const r2Live = [...liveUrls].filter((u) => R2_BASE && u.startsWith(R2_BASE)).length
  logger.info(`Images: ${liveUrls.size}/${urls.length} candidate URLs live (${r2Live} Hightail shots on R2).`)

  if (dryRun) {
    const s = todo[0]
    if (s) {
      const p = buildProductPayload(s, liveUrls, costAdjustment, "dry", "dry")
      logger.info(
        `Sample: ${p.handle} "${p.title}" — ${p.variants.length} variants, ${p.images.length} images, qty1 $${p.variants[0]?.prices?.[0]?.amount}`
      )
    }
    const unknown: string[] = []
    for (const st of todo) classifyJbsWearProduct({ title: st.title, category: st.category, subCategory: st.subCategory }, unknown)
    for (const m of new Set(unknown)) logger.warn(`[taxonomy] ${m}`)
    logger.info("Dry run — no writes.")
    return
  }

  // --- Medusa deps + brands ---------------------------------------------------
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const [salesChannel] = await salesChannelService.listSalesChannels({ name: "Default Sales Channel" })
  if (!salesChannel) throw new Error("Default Sales Channel not found")
  const [shippingProfile] = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!shippingProfile) throw new Error("Default shipping profile not found")
  const brandIds = await ensureJbsBrands(container, logger)

  // --- Create in batches ------------------------------------------------------
  const sourceByHandle = new Map(todo.map((s) => [s.handle, s]))
  let createdCount = 0
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE)
    const payloads = batch.map((s) =>
      buildProductPayload(s, liveUrls, costAdjustment, shippingProfile.id, salesChannel.id)
    )
    let created: any[]
    try {
      const { result } = await createProductsWorkflow(container).run({ input: { products: payloads } })
      created = (result as any[]) ?? []
    } catch (err: any) {
      logger.error(`Batch ${i / BATCH_SIZE + 1} failed (${batch.map((s) => s.code).join(",")}): ${err?.message ?? err}`)
      continue
    }
    createdCount += created.length

    for (const [brand, id] of Object.entries(brandIds)) {
      const mine = created.filter((p) => sourceByHandle.get(p.handle)?.brand === brand)
      if (!mine.length) continue
      await applyTaxonomyToProducts(container, {
        products: mine,
        sourceByHandle,
        classify: (s: JbsStyle, log) =>
          classifyJbsWearProduct({ title: s.title, category: s.category, subCategory: s.subCategory }, log),
        logger,
        brandHandle: brand,
      })
      await linkProductsToBrand(container, mine, id)
    }
    await applyShopCategoriesToProducts(container, created, logger)
    logger.info(`Created ${createdCount}/${todo.length}…`)
  }

  const purge = new Set<string>(["categories", "brands"])
  for (const h of Object.keys(brandIds)) tagsForBrand(h).forEach((t) => purge.add(t))
  for (const s of todo) tagsForProduct(s.handle).forEach((t) => purge.add(t))
  await revalidateStorefrontTags([...purge], logger)
  logger.info(`JB's Wear import complete — ${createdCount} products created.`)
}

const R2_BASE = (process.env.MINIO_PUBLIC_URL ?? "").replace(/\/$/, "")
const r2Url = (style: string, colour: string, view: "front" | "back") =>
  R2_BASE ? `${R2_BASE}/${jbsImageKey(style, colour, view)}` : null

function buildProductPayload(
  style: JbsStyle,
  liveUrls: Set<string>,
  costAdjustment: number,
  shippingProfileId: string,
  salesChannelId: string
): any {
  const liveImg = (u: string | null) => (u && liveUrls.has(u) ? u : null)
  // Per colour: R2 shots from the Hightail pack (upload-jbs-wear-images) win;
  // the jbswear.com.au photo is the front-only fallback.
  const shots = (v: JbsStyle["variants"][number]) => {
    const front = liveImg(r2Url(style.code, v.colourCode, "front")) ?? liveImg(v.imageUrl)
    const back = liveImg(r2Url(style.code, v.colourCode, "back"))
    return { front, back }
  }
  const colours = [...new Set(style.variants.map((v) => v.colour))]
  const sizes = [...new Set(style.variants.map((v) => v.size))]
  // Gallery: every colour's front, then backs (thumbnail = first front).
  const allShots = style.variants.map(shots)
  const images = [
    ...new Set([...allShots.map((x) => x.front), ...allShots.map((x) => x.back)].filter(Boolean)),
  ] as string[]
  const minCost = Math.min(...style.variants.map((v) => v.cost)) * costAdjustment

  const variants = style.variants.map((v) => {
    const cost = v.cost * costAdjustment
    const tierMinor = ladderToTierMinor(buildPriceLadder(cost))
    const { front, back } = shots(v)
    return {
      title: `${v.colour} / ${v.size}`,
      sku: v.sku,
      barcode: v.barcode ?? undefined,
      weight: v.weightGrams ?? undefined,
      manage_inventory: false,
      allow_backorder: true,
      options: { Colour: v.colour, Size: v.size },
      prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
      metadata: {
        jbs_wear: { style_code: style.code, sku: v.sku, colour: v.colour, size: v.size },
        bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, SOURCE),
        cost_adjustment: costAdjustment,
        cost_price_ex_gst_minor: Math.round(cost * 100),
        ...(front
          ? { garment_images: { front, ...(back ? { back } : {}), all: back ? [front, back] : [front] } }
          : {}),
        garment_color: v.colour,
      },
    }
  })

  return {
    title: style.title,
    handle: style.handle,
    status: ProductStatus.PUBLISHED,
    description: renderJbsDescription(style),
    thumbnail: images[0],
    images: images.map((url) => ({ url })),
    options: [
      { title: "Colour", values: colours },
      { title: "Size", values: sizes },
    ],
    variants,
    shipping_profile_id: shippingProfileId,
    sales_channels: [{ id: salesChannelId }],
    metadata: {
      source: SOURCE,
      gsm: parseGsm(style.details),
      bulk_pricing: tierMinorToBulkPricingMetadata(
        ladderToTierMinor(buildPriceLadder(minCost)),
        SOURCE
      ),
      jbs_wear: {
        style_code: style.code,
        category: style.category,
        sub_category: style.subCategory,
        website_url: style.websiteUrl,
        new_2026: style.isNew,
        last_sync: new Date().toISOString(),
      },
    },
  }
}

/**
 * Ensure the JB's parent brand + its three house labels exist. Reuses any
 * existing row by handle (staff edits win); new labels are parented to JB's.
 * Returns brand handle → id.
 */
async function ensureJbsBrands(container: any, logger: any): Promise<Record<string, string>> {
  const brandService = container.resolve(BRAND_MODULE) as any
  const all = (await brandService.listBrands({})) as Array<{ id: string; handle: string }>
  const byHandle = new Map(all.map((b) => [(b.handle ?? "").toLowerCase(), b.id]))
  const ids: Record<string, string> = {}

  // Parent first so the labels can be parented to it.
  const ordered = Object.values(JBS_BRANDS)
  for (const b of [...ordered.filter((x) => x.handle === PARENT_HANDLE), ...ordered.filter((x) => x.handle !== PARENT_HANDLE)]) {
    const existingId = byHandle.get(b.handle) ?? (b.handle === PARENT_HANDLE ? byHandle.get("jb's-wear") : undefined)
    if (existingId) {
      ids[b.handle] = existingId
      continue
    }
    const [created] = await brandService.createBrands([
      {
        name: b.name,
        handle: b.handle,
        external_code: b.code,
        parent_id: b.handle === PARENT_HANDLE ? null : ids[PARENT_HANDLE] ?? null,
        metadata: { supplier: "JB's Wear", supplier_url: "https://www.jbswear.com.au" },
      },
    ])
    ids[b.handle] = created.id
    logger.info(`Created Brand "${b.name}".`)
  }
  return ids
}

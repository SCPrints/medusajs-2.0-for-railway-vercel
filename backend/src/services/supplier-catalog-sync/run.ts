/**
 * Nightly supplier catalog sync (AS Colour, FashionBiz, Aussie Pacific, Legend Life).
 *
 *   - New styles the supplier lists (not discontinued) are imported with the
 *     same code as the admin "Import" buttons, as DRAFTS — nothing new goes
 *     on the website until staff review the report and publish it.
 *   - Our live products the supplier has discontinued or stopped listing are
 *     set to draft (never deleted), stamped `metadata.supplier_sync`.
 *   - Everything is emailed as a report: staff publish the new drafts they
 *     want, and re-publish anything hidden by mistake.
 *
 * Mode comes from SUPPLIER_CATALOG_SYNC: "off" (default) | "report" (email
 * what WOULD change, write nothing) | "apply".
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import { ASCOLOUR_MODULE } from "../../modules/ascolour"
import type AsColourService from "../../modules/ascolour/service"
import { FASHIONBIZ_MODULE } from "../../modules/fashionbiz"
import type FashionBizService from "../../modules/fashionbiz/service"
import type { FashionBizBrandSlug } from "../../modules/fashionbiz/types"
import { handleForProduct as fbHandle } from "../../modules/fashionbiz/mapping"
import { AUSSIEPACIFIC_MODULE } from "../../modules/aussiepacific"
import type AussiePacificService from "../../modules/aussiepacific/service"
import { handleForProduct as apHandle } from "../../modules/aussiepacific/mapping"
import { asColourHandle } from "../../lib/ascolour-handle"
import { isLockSkipped, withSupplierLock } from "../../lib/supplier-sync-lock"
import { revalidateStorefrontTags } from "../../lib/storefront-revalidate"
import {
  ADMIN_PUBLIC_URL,
  BACKEND_URL,
  CONTACT_NOTIFICATION_EMAIL,
  SUPPORT_REPLY_TO_EMAIL,
} from "../../lib/constants"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { importAsColourStyles } from "./ascolour-import"
import { importFashionBizStyles } from "./fashionbiz-import"
import { importAussiePacificStyles } from "./aussiepacific-import"
import { importLegendLifeStyles } from "./legendlife-import"
import {
  fetchAllLegendLifeProducts,
  handleFor as legendLifeHandle,
  legendLifeToken,
} from "../../lib/legendlife-catalog"
import { planCatalogSync, type FeedItem, type HideReason, type OurProduct } from "./plan"

export type CatalogSyncMode = "off" | "report" | "apply"

export const catalogSyncMode = (): CatalogSyncMode => {
  const v = String(process.env.SUPPLIER_CATALOG_SYNC ?? "").trim().toLowerCase()
  return v === "apply" || v === "report" ? v : "off"
}

// ponytail: per-run cap keeps one night's job bounded (the first run after
// launch has ~170 AS Colour styles waiting); the rest land on later nights.
const MAX_ADDS_PER_RUN = Number(process.env.SUPPLIER_CATALOG_SYNC_MAX_ADDS) || 100

const FB_BRANDS: FashionBizBrandSlug[] = ["biz-collection", "biz-care", "biz-corporates", "syzmik"]

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

type ProductLine = { title: string; code: string; handle: string; admin_url: string | null; store_url: string | null }

export type SupplierSyncReport = {
  supplier: string
  mode: CatalogSyncMode
  added: ProductLine[]
  add_errors: Array<{ code: string; error: string }>
  /** Report mode: would be added. Apply mode: over the per-run cap, added next run. */
  pending_add: ProductLine[]
  hidden: Array<ProductLine & { reason: HideReason }>
  /** Missing from the feed but not hidden because the safety stop tripped. */
  held: ProductLine[]
  hide_blocked_reason: string | null
  error: string | null
}

type Supplier = {
  key: "ascolour" | "fashionbiz" | "aussiepacific" | "legendlife"
  label: string
  /** Medusa module holding the supplier client… */
  module?: string
  /** …or, for API-token suppliers with no module, the client itself (null = not configured). */
  service?: () => unknown
  fetchFeed: (svc: any) => Promise<FeedItem[]>
  ourCode: (row: { handle: string; metadata: any }) => string | null
  /**
   * Which feed group (FashionBiz brand list) a product of ours belongs to.
   * If that whole list came back empty we can't tell "dropped" from "list
   * broken", so its missing products are held, never hidden.
   */
  ourGroup?: (row: { handle: string; metadata: any }) => string | null
  importCodes: (container: MedusaContainer, svc: any, items: FeedItem[]) => Promise<{
    imported: string[]
    errors: Array<{ code: string; error: string }>
  }>
}

const fbBrandOf = (row: { handle: string; metadata: any }): FashionBizBrandSlug | null => {
  const fromMeta = row.metadata?.fashionbiz?.brand_slug
  if (FB_BRANDS.includes(fromMeta)) return fromMeta
  return FB_BRANDS.find((b) => row.handle.startsWith(`${b}-`)) ?? null
}

const SUPPLIERS: Supplier[] = [
  {
    key: "ascolour",
    label: "AS Colour",
    module: ASCOLOUR_MODULE,
    fetchFeed: async (svc: AsColourService) =>
      (await svc.fetchAllProducts()).map((p: any) => ({
        code: String(p.styleCode),
        handle: asColourHandle(p.styleName, p.styleCode),
        name: String(p.styleName ?? p.styleCode).replace(/\s*\|\s*\d+[A-Z]*\s*$/, "").trim(),
        discontinued: /S$/.test(String(p.styleCode ?? "")),
      })),
    ourCode: (row) => row.metadata?.ascolour?.styleCode ?? null,
    importCodes: async (container, svc, items) => {
      const r = await importAsColourStyles(container, svc, items.map((f) => f.code), ProductStatus.DRAFT)
      return { imported: r.imported, errors: r.errors.map((e) => ({ code: e.styleCode, error: e.error })) }
    },
  },
  {
    key: "fashionbiz",
    label: "FashionBiz",
    module: FASHIONBIZ_MODULE,
    fetchFeed: async (svc: FashionBizService) => {
      const out: FeedItem[] = []
      // A failed brand throws, so a partial feed never reads as "discontinued".
      for (const brand of FB_BRANDS) {
        for (const p of await svc.fetchAllProductsWithDetail(brand)) {
          // Keyed on slug alone: FashionBiz moved Biz Care styles into the
          // biz-collection list (Nov 2026; the biz-care list is now empty),
          // so brand is not a stable key.
          out.push({
            code: p.slug,
            handle: fbHandle(brand, p.slug),
            name: p.name,
            discontinued: String(p.sales_status ?? "").trim().toLowerCase() === "clearance",
            group: brand,
          })
        }
      }
      return out
    },
    ourCode: (row) => row.metadata?.fashionbiz?.slug ?? null,
    ourGroup: fbBrandOf,
    importCodes: async (container, svc, items) => {
      const imported: string[] = []
      const errors: Array<{ code: string; error: string }> = []
      for (const brand of FB_BRANDS) {
        const slugs = items.filter((f) => f.group === brand).map((f) => f.code)
        if (!slugs.length) continue
        const r = await importFashionBizStyles(container, svc, brand, slugs, ProductStatus.DRAFT)
        imported.push(...r.imported)
        errors.push(...r.errors.map((e) => ({ code: e.slug, error: e.error })))
      }
      return { imported, errors }
    },
  },
  {
    key: "aussiepacific",
    label: "Aussie Pacific",
    module: AUSSIEPACIFIC_MODULE,
    fetchFeed: async (svc: AussiePacificService) =>
      (await svc.fetchAllProductStubs()).map((p) => ({
        code: String(p.style_code),
        handle: apHandle(String(p.style_code)),
        name: p.name ?? String(p.style_code),
        discontinued: p.run_out === true,
      })),
    ourCode: (row) => row.metadata?.aussiepacific?.style_code ?? null,
    importCodes: async (container, svc, items) => {
      const r = await importAussiePacificStyles(container, svc, items.map((f) => f.code), ProductStatus.DRAFT)
      return { imported: r.imported, errors: r.errors.map((e) => ({ code: e.style_code, error: e.error })) }
    },
  },
  {
    // The API has no discontinued flag: a dropped style just leaves the list,
    // so hides are all "not_listed" and the safety stop guards a bad feed.
    key: "legendlife",
    label: "Legend Life",
    service: legendLifeToken,
    fetchFeed: async (token: string) =>
      (await fetchAllLegendLifeProducts(token)).map((p) => ({
        code: p.styleCode,
        handle: legendLifeHandle(p),
        name: p.name,
        discontinued: false,
      })),
    ourCode: (row) => row.metadata?.legendlife?.style_code ?? null,
    importCodes: async (container, token: string, items) => {
      const want = new Set(items.map((f) => f.code))
      const products = (await fetchAllLegendLifeProducts(token)).filter((p) => want.has(p.styleCode))
      const r = await importLegendLifeStyles(container, products, { token })
      return { imported: r.imported, errors: r.errors }
    },
  },
]

const adminBase = () => (ADMIN_PUBLIC_URL || BACKEND_URL || "").replace(/\/$/, "") || null
const storeBase = () => {
  const url = process.env.STOREFRONT_URL?.replace(/\/$/, "")
  return url ? `${url}/${process.env.STOREFRONT_DEFAULT_COUNTRY_CODE || "au"}` : null
}
const line = (p: { title: string; code: string; handle: string; id?: string }): ProductLine => ({
  title: p.title,
  code: p.code,
  handle: p.handle,
  admin_url: p.id && adminBase() ? `${adminBase()}/app/products/${p.id}` : null,
  store_url: storeBase() ? `${storeBase()}/products/${p.handle}` : null,
})

async function loadOurs(container: MedusaContainer, s: Supplier): Promise<Array<OurProduct & { metadata: any }>> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows: Array<{ id: string; handle: string; title: string; status: string; metadata: any }> = await pg
    .select("id", "handle", "title", "status", "metadata")
    .from("product")
    .whereNull("deleted_at")
    .whereRaw("metadata->>'source' = ?", [s.key])
  return rows
    .filter((r) => s.key !== "fashionbiz" || fbBrandOf(r))
    .map((r) => ({ ...r, code: s.ourCode(r) }))
}

async function syncSupplier(
  container: MedusaContainer,
  s: Supplier,
  svc: unknown,
  mode: CatalogSyncMode,
  logger: Logger
): Promise<SupplierSyncReport> {
  const report: SupplierSyncReport = {
    supplier: s.label,
    mode,
    added: [],
    add_errors: [],
    pending_add: [],
    hidden: [],
    held: [],
    hide_blocked_reason: null,
    error: null,
  }

  const feed = await s.fetchFeed(svc)
  const ours = await loadOurs(container, s)
  const plan = planCatalogSync(feed, ours)
  report.hide_blocked_reason = plan.hideBlockedReason
  logger.info(
    `[catalog-sync] ${s.label}: feed ${feed.length}, ours ${ours.length}, add ${plan.toAdd.length}, hide ${plan.toHide.length}${plan.hideBlockedReason ? " (hide blocked)" : ""}`
  )

  // ---- hide (before adding, so the guard judged the catalog as it was) ----
  // Explicit discontinued flags always go; "not listed" ones only when the
  // safety stop didn't trip (then they are held for staff to check).
  const feedGroups = new Set(feed.map((f) => f.group).filter(Boolean))
  const emptyGroups = new Set<string>()
  const inEmptyGroup = (p: OurProduct) => {
    const g = s.ourGroup?.(ours.find((o) => o.id === p.id) ?? { handle: p.handle, metadata: {} })
    if (!g || feedGroups.has(g)) return false
    emptyGroups.add(g)
    return true
  }
  const hideNow = plan.toHide.filter(
    (p) => p.reason === "discontinued" || (!plan.hideBlockedReason && !inEmptyGroup(p))
  )
  report.held = plan.toHide
    .filter((p) => !hideNow.includes(p))
    .map((p) => line({ ...p, code: p.code ?? "" }))
  if (emptyGroups.size && !report.hide_blocked_reason) {
    report.hide_blocked_reason = `${s.label}'s ${[...emptyGroups].join(", ")} list came back empty, so we can't tell if these were dropped. Not hidden. Check them on the supplier's site.`
  }
  if (mode === "apply") {
    const now = new Date().toISOString()
    for (const p of hideNow) {
      const existing = ours.find((o) => o.id === p.id)?.metadata ?? {}
      try {
        await updateProductsWorkflow(container).run({
          input: {
            products: [
              { id: p.id, status: "draft", metadata: { ...existing, supplier_sync: { hidden_at: now, reason: p.reason } } },
            ] as any,
          },
        })
        report.hidden.push({ ...line({ ...p, code: p.code ?? "" }), reason: p.reason })
      } catch (err: any) {
        report.add_errors.push({ code: p.code ?? p.handle, error: `Could not hide: ${err?.message ?? err}` })
      }
    }
  } else {
    report.hidden = hideNow.map((p) => ({ ...line({ ...p, code: p.code ?? "" }), reason: p.reason }))
  }

  // ---- add ----
  const batch = mode === "apply" ? plan.toAdd.slice(0, MAX_ADDS_PER_RUN) : []
  const rest = mode === "apply" ? plan.toAdd.slice(MAX_ADDS_PER_RUN) : plan.toAdd
  report.pending_add = rest.map((f) => line({ title: f.name, code: f.code, handle: f.handle }))
  if (batch.length) {
    const r = await s.importCodes(container, svc, batch)
    report.add_errors.push(...r.errors)
    const importedSet = new Set(r.imported.map((c) => c.toLowerCase()))
    const after = await loadOurs(container, s)
    for (const f of batch) {
      if (!importedSet.has(f.code.toLowerCase())) continue
      const row = after.find((o) => (o.code ?? "").toLowerCase() === f.code.toLowerCase() || o.handle === f.handle)
      // Drafts have no website page yet — admin link only.
      report.added.push({
        ...line({ title: row?.title ?? f.name, code: f.code, handle: row?.handle ?? f.handle, id: row?.id }),
        store_url: null,
      })
    }
  }

  return report
}

export const reportHasNews = (r: SupplierSyncReport) =>
  !!(r.added.length || r.add_errors.length || r.pending_add.length || r.hidden.length || r.held.length || r.error)

/**
 * Run the sync for every registered supplier and email one report.
 * `only` limits it to some suppliers (script use).
 */
export async function runSupplierCatalogSync(
  container: MedusaContainer,
  opts: { mode?: CatalogSyncMode; only?: string[] } = {}
): Promise<SupplierSyncReport[]> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const mode = opts.mode ?? catalogSyncMode()
  if (mode === "off") {
    logger.info("[catalog-sync] SUPPLIER_CATALOG_SYNC is off — skipping.")
    return []
  }

  const reports: SupplierSyncReport[] = []
  for (const s of SUPPLIERS) {
    if (opts.only?.length && !opts.only.includes(s.key)) continue
    let svc: unknown
    try {
      svc = s.service ? s.service() : container.resolve(s.module!)
    } catch {
      svc = null
    }
    if (!svc) {
      logger.info(`[catalog-sync] ${s.label} not configured — skipping.`)
      continue
    }
    try {
      const out = await withSupplierLock(container, s.key, () => syncSupplier(container, s, svc, mode, logger))
      if (isLockSkipped(out)) {
        reports.push(emptyReport(s.label, mode, "Skipped: another sync or import for this supplier was running."))
      } else {
        reports.push(out)
      }
    } catch (err: any) {
      logger.error(`[catalog-sync] ${s.label} failed: ${err?.message ?? err}`)
      reports.push(emptyReport(s.label, mode, err?.message ?? String(err)))
    }
  }

  if (mode === "apply" && reports.some((r) => r.added.length || r.hidden.length)) {
    await revalidateStorefrontTags(["products", "categories"], logger)
  }

  await emailReport(container, reports, mode, logger)
  return reports
}

const emptyReport = (supplier: string, mode: CatalogSyncMode, error: string): SupplierSyncReport => ({
  supplier,
  mode,
  added: [],
  add_errors: [],
  pending_add: [],
  hidden: [],
  held: [],
  hide_blocked_reason: null,
  error,
})

async function emailReport(
  container: MedusaContainer,
  reports: SupplierSyncReport[],
  mode: CatalogSyncMode,
  logger: Logger
) {
  const news = reports.filter(reportHasNews)
  const to = process.env.SUPPLIER_CATALOG_SYNC_EMAIL || CONTACT_NOTIFICATION_EMAIL
  if (!news.length || !to) return
  const added = news.reduce((n, r) => n + r.added.length, 0)
  const hidden = news.reduce((n, r) => n + r.hidden.length, 0)
  const subject =
    mode === "report"
      ? "Supplier catalog check: changes waiting (nothing changed yet)"
      : `Supplier catalog sync: ${added} new drafts to review, ${hidden} hidden`
  try {
    const notifications = container.resolve(Modules.NOTIFICATION) as any
    await notifications.createNotifications({
      to,
      channel: "email",
      template: EmailTemplates.SUPPLIER_CATALOG_SYNC,
      data: {
        emailOptions: { replyTo: SUPPORT_REPLY_TO_EMAIL, subject },
        sync: { mode, reports: news, adminUrl: adminBase() },
      },
    })
  } catch (err: any) {
    logger.error(`[catalog-sync] report email failed: ${err?.message ?? err}`)
  }
}

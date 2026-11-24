/**
 * Team stores — pure rules (Docs/TEAM_STORES_SPEC.md). No @medusajs/framework
 * imports: the admin bundle reads the status labels from here.
 */
import { sortSizes } from "./garment-measurements"

export const TEAM_STORE_STATUSES = [
  "draft",
  "awaiting_approval",
  "open",
  "closed",
  "in_production",
  "completed",
  "cancelled",
] as const
export type TeamStoreStatus = (typeof TEAM_STORE_STATUSES)[number]

export const TEAM_STORE_STATUS_LABEL: Record<TeamStoreStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  open: "Open",
  closed: "Closed",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** Statuses a buyer can see the page for (the grid only shows while open). */
export const BUYER_VISIBLE_STATUSES = new Set<string>(["open", "closed", "in_production", "completed"])

export const isTeamStoresEnabled = (): boolean =>
  typeof process !== "undefined" && String(process.env?.TEAM_STORES_ENABLED).toLowerCase() === "true"

type Dateish = Date | string | null | undefined
const ms = (v: Dateish): number | null => {
  if (!v) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

export type StoreWindow = { status: string; opens_at?: Dateish; closes_at: Dateish }

/** What a buyer sees: the item grid only while the store is open and inside its dates. */
export function buyerState(store: StoreWindow, now: Date): "open" | "not_yet_open" | "closed" {
  const opens = ms(store.opens_at)
  const closes = ms(store.closes_at)
  if (store.status !== "open") return store.status === "awaiting_approval" || store.status === "draft" ? "not_yet_open" : "closed"
  if (closes !== null && closes <= now.getTime()) return "closed"
  if (opens !== null && opens > now.getTime()) return "not_yet_open"
  return "open"
}

/** Open stores whose closing time has passed. */
export function storesDueToClose<T extends StoreWindow & { id: string }>(stores: T[], now: Date): T[] {
  return stores.filter((s) => s.status === "open" && (ms(s.closes_at) ?? Infinity) <= now.getTime())
}

/** Approved stores whose opening time has come (they open themselves). */
export function storesDueToOpen<T extends StoreWindow & { id: string; approved_at?: Dateish }>(
  stores: T[],
  now: Date
): T[] {
  return stores.filter((s) => {
    const opens = ms(s.opens_at)
    return (
      s.status === "awaiting_approval" &&
      ms(s.approved_at) !== null &&
      opens !== null &&
      opens <= now.getTime() &&
      (ms(s.closes_at) ?? Infinity) > now.getTime()
    )
  })
}

export const isUnderMinimum = (minimum: number | null | undefined, units: number): boolean =>
  typeof minimum === "number" && minimum > 0 && units < minimum

// ── Cart rules (Decision 4: a team-store cart holds only that store's items) ──

type LineLike = { metadata?: Record<string, unknown> | null }
const storeIdOf = (line: LineLike): string | null => {
  const v = line?.metadata?.team_store_id
  return typeof v === "string" && v ? v : null
}

export const TEAM_STORE_CART_ONLY_MESSAGE =
  "Your cart has team store items, which check out on their own. Finish that order (or empty your cart) before adding other products."

/** The store a cart belongs to (from its lines), or null for a normal cart. */
export function cartTeamStoreId(lines: LineLike[]): string | null {
  for (const l of lines ?? []) {
    const id = storeIdOf(l)
    if (id) return id
  }
  return null
}

/** Why `storeId`'s items can't go into a cart holding `lines`, or null when they can. */
export function teamStoreCartMixError(lines: LineLike[], storeId: string): string | null {
  for (const l of lines ?? []) {
    const id = storeIdOf(l)
    if (!id) {
      return "Your cart has other products. Team store orders check out on their own: finish that order (or empty your cart) first."
    }
    if (id !== storeId) {
      return "Your cart has items from another team store. Finish that order (or empty your cart) first."
    }
  }
  return null
}

/** Bulk delivery to the club: every line is a bulk team-store line. Shipping is $0. */
export function isBulkTeamStoreCart(items: LineLike[] | null | undefined): boolean {
  const list = items ?? []
  return list.length > 0 && list.every((i) => i?.metadata?.team_store_delivery === "bulk")
}

// ── Variants ────────────────────────────────────────────────────────────────

export type VariantLike = {
  id: string
  title?: string | null
  product?: { handle?: string | null } | null
  options?: Array<{ value?: string | null; option?: { title?: string | null } | null }> | null
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase()
const optionValue = (v: VariantLike, re: RegExp) =>
  (v.options ?? []).find((o) => re.test(o?.option?.title ?? ""))?.value ?? null
const titleTokens = (v: VariantLike) => String(v.title ?? "").split("/").map((t) => t.trim()).filter(Boolean)

/** "Colour"/"Color" option value, else the first " / " token of the title ("Black / M"). */
export const variantColour = (v: VariantLike): string | null =>
  optionValue(v, /colou?r/i) ?? (titleTokens(v).length > 1 ? titleTokens(v)[0] : null)

/** "Size" option value, else the last " / " token of the title. */
export const variantSize = (v: VariantLike): string | null =>
  optionValue(v, /size/i) ?? titleTokens(v).at(-1) ?? null

export type TeamStoreItemLike = {
  id: string
  product_handle: string
  colour: string
  allowed_sizes?: { sizes?: string[] } | null
}

export const allowedSizesOf = (item: TeamStoreItemLike): string[] | null => {
  const sizes = item.allowed_sizes?.sizes
  return Array.isArray(sizes) && sizes.length ? sizes : null
}

/** The item's buyable variants (its garment + colour + allowed sizes), in size order. */
export function itemVariants<V extends VariantLike>(item: TeamStoreItemLike, variants: V[]): Array<V & { size: string }> {
  const allowed = allowedSizesOf(item)?.map(norm) ?? null
  const rows = variants
    .filter((v) => norm(variantColour(v)) === norm(item.colour))
    .map((v) => ({ ...v, size: variantSize(v) ?? "" }))
    .filter((v) => v.size && (!allowed || allowed.includes(norm(v.size))))
  const order = sortSizes(rows.map((r) => r.size))
  return rows.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
}

/** Null when the variant is the item's garment, colour and an allowed size; else why not. */
export function variantItemError(item: TeamStoreItemLike, variant: VariantLike): string | null {
  if (norm(variant.product?.handle) !== norm(item.product_handle)) return "That size isn't part of this item."
  if (norm(variantColour(variant)) !== norm(item.colour)) return "That colour isn't part of this item."
  const allowed = allowedSizesOf(item)
  const size = variantSize(variant)
  if (allowed && !allowed.map(norm).includes(norm(size))) return `Size ${size ?? "?"} isn't available in this store.`
  return null
}

/** Mockup URLs of a Studio design (never print files). */
export function designMockups(design: unknown): string[] {
  const artifacts = (design as { artifacts?: unknown } | null)?.artifacts
  if (!Array.isArray(artifacts)) return []
  return artifacts
    .map((a) => (a as { mockupUrl?: unknown })?.mockupUrl)
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
}

// ── Fundraising ─────────────────────────────────────────────────────────────

/** Dollars (inc GST) added to every item for the club or school; staff pay it back after the run. */
export const FUNDRAISING_MAX_PER_ITEM = 100

export function storeFundraising(store: { metadata?: Record<string, unknown> | null } | null | undefined): number {
  const n = Number(store?.metadata?.fundraising_per_item)
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, FUNDRAISING_MAX_PER_ITEM) * 100) / 100 : 0
}

/** What the buyer pays for an item: our price plus the store's fundraising amount. */
export const buyerUnitPrice = (unitPrice: number | string, fundraising: number): number =>
  Math.round((Number(unitPrice) + fundraising) * 100) / 100

// ── The production run ──────────────────────────────────────────────────────

export type RunOrderLine = {
  quantity: number | string
  unit_price: number | string | null
  variant_title?: string | null
  title?: string | null
  thumbnail?: string | null
  metadata?: Record<string, unknown> | null
}
export type RunOrder = {
  id: string
  display_id?: number | null
  status?: string | null
  email?: string | null
  name?: string | null
  /** Production track, for "every order delivered". */
  downstream?: string | null
  items: RunOrderLine[]
}

export type RunItemSummary = {
  item_id: string
  title: string
  thumbnail: string | null
  sizes: Array<{ size: string; quantity: number }>
  units: number
  revenue: number
}

export type RunSummary = {
  order_ids: string[]
  orders: number
  units: number
  revenue: number
  /** Raised for the club / school (part of revenue): paid back to them after the run. */
  fundraising: number
  items: RunItemSummary[]
  buyers: Array<{ order_id: string; display_id: number | null; name: string | null; email: string | null; units: number }>
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Size totals, units and revenue across a store's orders. Cancelled orders
 * and lines from other stores are excluded (Risk: refunds after close).
 */
export function summariseRun(storeId: string, orders: RunOrder[]): RunSummary {
  const byItem = new Map<string, RunItemSummary & { sizeMap: Map<string, number> }>()
  const summary: RunSummary = { order_ids: [], orders: 0, units: 0, revenue: 0, fundraising: 0, items: [], buyers: [] }

  for (const order of orders ?? []) {
    if (order.status === "canceled") continue
    let units = 0
    for (const line of order.items ?? []) {
      const meta = line.metadata ?? {}
      if (meta.team_store_id !== storeId) continue
      const qty = Math.max(0, Math.floor(num(line.quantity)))
      if (!qty) continue
      const itemId = typeof meta.team_store_item_id === "string" ? meta.team_store_item_id : "unknown"
      const size =
        (typeof meta.team_store_size === "string" && meta.team_store_size) ||
        String(line.variant_title ?? "").split("/").map((t) => t.trim()).filter(Boolean).at(-1) ||
        "—"
      let row = byItem.get(itemId)
      if (!row) {
        row = {
          item_id: itemId,
          title: (typeof meta.team_store_item_title === "string" && meta.team_store_item_title) || line.title || "Item",
          thumbnail: line.thumbnail ?? null,
          sizes: [],
          units: 0,
          revenue: 0,
          sizeMap: new Map(),
        }
        byItem.set(itemId, row)
      }
      row.sizeMap.set(size, (row.sizeMap.get(size) ?? 0) + qty)
      row.units += qty
      row.revenue += qty * num(line.unit_price)
      units += qty
      summary.revenue += qty * num(line.unit_price)
      summary.fundraising += qty * num(meta.team_store_fundraising)
    }
    if (!units) continue
    summary.order_ids.push(order.id)
    summary.orders += 1
    summary.units += units
    summary.buyers.push({
      order_id: order.id,
      display_id: order.display_id ?? null,
      name: order.name ?? null,
      email: order.email ?? null,
      units,
    })
  }

  summary.items = [...byItem.values()].map(({ sizeMap, ...row }) => {
    const order = sortSizes([...sizeMap.keys()])
    return {
      ...row,
      revenue: round2(row.revenue),
      sizes: order.map((size) => ({ size, quantity: sizeMap.get(size) ?? 0 })),
    }
  })
  summary.revenue = round2(summary.revenue)
  summary.fundraising = round2(summary.fundraising)
  return summary
}

/** Run-quote lines: one per item × size, at the average price paid. */
export function runQuoteLines(summary: RunSummary): Array<Record<string, unknown>> {
  return summary.items.flatMap((item) => {
    const unit = item.units ? round2(item.revenue / item.units) : 0
    return item.sizes.map((s) => ({
      id: `ts_${item.item_id}_${s.size}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      title: `${item.title} — ${s.size}`,
      description: null,
      quantity: s.quantity,
      unit_price: unit,
      total: round2(unit * s.quantity),
      thumbnail: item.thumbnail,
      group_id: `ts_${item.item_id}`,
      team_store_item_id: item.item_id,
    }))
  })
}

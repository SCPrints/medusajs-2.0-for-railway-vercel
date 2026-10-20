/**
 * Bundle → priced cart lines.
 *
 * Bundles used to add bare garments with a `decoration_type` label that
 * nothing priced, so every pack checked out at blank-garment price. This
 * module turns a bundle item's staff-configured print positions into the
 * same `customizerDesign` pricing shape the Studio writes (prints[] +
 * sideDecorationMethods + sideEmbroideryConfigs), so the canonical pricing
 * brain (computeDecorationTotals via computeScpLineDescriptor and the
 * cart-wide recompute) charges for decoration with no bundle-specific math.
 *
 * Metadata is built SERVER-SIDE from the bundle row — the storefront only
 * sends which item, which garment choice, and which variants/quantities.
 *
 * Pack discount: `bundle.discount_pct` applies to a bundle's lines only while
 * the cart holds at least one line for every item in that bundle. Resolved
 * from the DB at recompute/checkout time — never trusted from line metadata.
 */
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"

import { BUNDLES_MODULE } from "../modules/bundles"
import type BundlesModuleService from "../modules/bundles/service"
import { APPAREL_SIDE_KEYS, PRINT_SIZES, type PrintSizeId } from "./print-profile"
import type { ScpAddLineInput } from "./scp-add-lines"

export type BundlePrintPosition = {
  side: string
  method: "print" | "embroidery"
  /** Print only. */
  size_id?: PrintSizeId
  /** Embroidery only. */
  stitch_count?: number
  width_mm?: number
  height_mm?: number
}

export type BundleChoice = { label: string; product_handle: string }

export type BundleItemLike = {
  id: string
  product_handle: string
  label: string
  decoration_type: string
  print_positions?: unknown
  choices?: unknown
}

export type BundleLike = {
  id: string
  handle: string
  title: string
}

/** Studio's default stitch estimate (embroidery-side-config) — keep in step. */
export const DEFAULT_STITCH_COUNT = 4000
/** A typical left-chest logo. Same dims across items = one digitizing fee. */
export const DEFAULT_EMBROIDERY_WIDTH_MM = 90
export const DEFAULT_EMBROIDERY_HEIGHT_MM = 60
export const MAX_BUNDLE_DISCOUNT_PCT = 30

const SIDES = new Set<string>(APPAREL_SIDE_KEYS)
const SIZES = new Set<string>(PRINT_SIZES)

const positiveInt = (v: unknown): number | undefined => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Validate staff-entered positions. Drops anything malformed; one entry per side. */
export function sanitizePrintPositions(input: unknown): BundlePrintPosition[] {
  const raw = (input as { positions?: unknown } | null)?.positions ?? input
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: BundlePrintPosition[] = []
  for (const entry of raw) {
    const e = entry as Record<string, unknown>
    const side = typeof e?.side === "string" ? e.side : ""
    if (!SIDES.has(side) || seen.has(side)) continue
    if (e.method === "embroidery") {
      seen.add(side)
      out.push({
        side,
        method: "embroidery",
        stitch_count: positiveInt(e.stitch_count) ?? DEFAULT_STITCH_COUNT,
        width_mm: positiveInt(e.width_mm) ?? DEFAULT_EMBROIDERY_WIDTH_MM,
        height_mm: positiveInt(e.height_mm) ?? DEFAULT_EMBROIDERY_HEIGHT_MM,
      })
    } else if (e.method === "print") {
      seen.add(side)
      out.push({
        side,
        method: "print",
        size_id: SIZES.has(e.size_id as string) ? (e.size_id as PrintSizeId) : "up_to_a4",
      })
    }
  }
  return out
}

/**
 * Positions to price. Items saved before positions existed fall back to one
 * front decoration matching their legacy `decoration_type`.
 */
export function resolvePrintPositions(item: BundleItemLike): BundlePrintPosition[] {
  const explicit = sanitizePrintPositions(item.print_positions)
  if (explicit.length) return explicit
  if (item.decoration_type === "embroidery") {
    return sanitizePrintPositions([{ side: "front", method: "embroidery" }])
  }
  if (item.decoration_type === "print") {
    return sanitizePrintPositions([{ side: "front", method: "print", size_id: "up_to_a4" }])
  }
  return []
}

export function sanitizeChoices(input: unknown): BundleChoice[] {
  const raw = (input as { options?: unknown } | null)?.options ?? input
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: BundleChoice[] = []
  for (const entry of raw) {
    const label = typeof entry?.label === "string" ? entry.label.trim() : ""
    const handle = typeof entry?.product_handle === "string" ? entry.product_handle.trim() : ""
    if (!label || !handle || seen.has(handle)) continue
    seen.add(handle)
    out.push({ label: label.slice(0, 60), product_handle: handle })
  }
  return out
}

/** Normalise admin-posted positions/choices into their stored jsonb shape. */
export function bundleItemExtras(item: { print_positions?: unknown; choices?: unknown }) {
  const positions = sanitizePrintPositions(item.print_positions)
  const choices = sanitizeChoices(item.choices)
  return {
    print_positions: positions.length ? { positions } : null,
    choices: choices.length ? { options: choices } : null,
  }
}

/** Every garment the customer may legitimately order for this item. */
export function allowedHandlesFor(item: BundleItemLike): Set<string> {
  return new Set([item.product_handle, ...sanitizeChoices(item.choices).map((c) => c.product_handle)])
}

const SIZE_RANK: Record<string, number> = { up_to_a6: 0, up_to_a4: 1, up_to_a3: 2, oversize: 3 }

/**
 * Build one bundle line's metadata. `printSizeId` is null for undecorated
 * items — those go to cart as plain garment lines (no SCP descriptor).
 */
export function buildBundleLineMetadata(input: {
  bundle: BundleLike
  item: BundleItemLike
  productHandle: string
  artworkUrl: string | null
  notes: string | null
  /** One per bundle add — keys the shared digitizing file when no artwork URL. */
  addToken: string
}): { metadata: Record<string, unknown>; printSizeId: PrintSizeId | null } {
  const { bundle, item, productHandle, artworkUrl, notes, addToken } = input
  const positions = resolvePrintPositions(item)

  const base: Record<string, unknown> = {
    bundle_id: bundle.id,
    bundle_handle: bundle.handle,
    bundle_title: bundle.title,
    bundle_item_id: item.id,
    bundle_item_label: item.label,
    decoration_type: item.decoration_type,
    product_handle: productHandle,
    artwork_url: artworkUrl,
    printNotes: notes,
  }
  if (!positions.length) return { metadata: base, printSizeId: null }

  const printPositions = positions.filter((p) => p.method === "print")
  const embroideryPositions = positions.filter((p) => p.method === "embroidery")
  const printSizeId: PrintSizeId = printPositions.length
    ? printPositions.reduce((a, b) => (SIZE_RANK[b.size_id!] > SIZE_RANK[a.size_id!] ? b : a)).size_id!
    : "up_to_a6"

  // Digitizing is charged per distinct file (artwork + size). The pricing
  // brain fingerprints a side by its layout objects' `src`/`text`, so every
  // embroidered side of this pack shares one key → one fee, amortised over
  // the whole pack instead of $60 per size line.
  const artworkObject = artworkUrl
    ? { type: "image", src: artworkUrl }
    : { type: "textbox", text: `bundle-artwork:${bundle.id}:${addToken}` }

  const customizerDesign: Record<string, unknown> = {
    type: "bundle_kit",
    version: 1,
    scpPrintSizeId: printSizeId,
    prints: positions.map((p) =>
      p.method === "print" ? { side: p.side, sizeId: p.size_id } : { side: p.side }
    ),
    sideDecorationMethods: Object.fromEntries(positions.map((p) => [p.side, p.method])),
    sideEmbroideryConfigs: Object.fromEntries(
      embroideryPositions.map((p) => [
        p.side,
        {
          stitchCount: p.stitch_count,
          includeDigitizingFee: true,
          widthMm: p.width_mm,
          heightMm: p.height_mm,
        },
      ])
    ),
    sideLayouts: embroideryPositions.map((p) => ({ side: p.side, objects: [artworkObject] })),
    customerOriginalFiles: artworkUrl ? [{ url: artworkUrl, fileName: "Bundle artwork" }] : [],
    printNotes: notes,
  }

  return { metadata: { ...base, customizerDesign }, printSizeId }
}

// ─── Pack discount ─────────────────────────────────────────────────────────

export type BundleDiscountDef = { discountPct: number; itemIds: string[] }

type LineLike = { id: string; metadata?: Record<string, unknown> | null }

/**
 * Per-line discount % for lines belonging to a bundle the cart holds in
 * full. Pure — `defs` comes from loadBundleDiscountDefs.
 */
export function bundleDiscountByLine(
  lines: LineLike[],
  defs: Map<string, BundleDiscountDef>
): Map<string, number> {
  const out = new Map<string, number>()
  if (!defs.size) return out
  const presentItems = new Map<string, Set<string>>()
  for (const line of lines) {
    const bundleId = line.metadata?.bundle_id
    const itemId = line.metadata?.bundle_item_id
    if (typeof bundleId !== "string" || typeof itemId !== "string") continue
    if (!presentItems.has(bundleId)) presentItems.set(bundleId, new Set())
    presentItems.get(bundleId)!.add(itemId)
  }
  for (const line of lines) {
    const bundleId = line.metadata?.bundle_id
    if (typeof bundleId !== "string") continue
    const def = defs.get(bundleId)
    if (!def || def.discountPct <= 0 || !def.itemIds.length) continue
    const present = presentItems.get(bundleId)!
    if (def.itemIds.every((id) => present.has(id))) out.set(line.id, def.discountPct)
  }
  return out
}

export function applyBundleDiscount(unitMajor: number, pct: number | undefined): number {
  if (!pct || pct <= 0) return unitMajor
  const safe = Math.min(MAX_BUNDLE_DISCOUNT_PCT, pct)
  return Math.round((unitMajor * (1 - safe / 100) + Number.EPSILON) * 100) / 100
}

/** Load discount defs for the active, discounted bundles referenced by these lines. */
export async function loadBundleDiscountDefs(
  scope: { resolve: (key: string) => unknown },
  lines: LineLike[]
): Promise<Map<string, BundleDiscountDef>> {
  const ids = Array.from(
    new Set(
      lines
        .map((l) => l.metadata?.bundle_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  )
  const defs = new Map<string, BundleDiscountDef>()
  if (!ids.length) return defs
  const service = scope.resolve(BUNDLES_MODULE) as BundlesModuleService
  const bundles = await service.listBundles({ id: ids, status: "active" })
  const discounted = bundles.filter((b) => Number(b.discount_pct) > 0)
  if (!discounted.length) return defs
  const items = await service.listBundleItems({ bundle_id: discounted.map((b) => b.id) })
  for (const b of discounted) {
    defs.set(b.id, {
      discountPct: Number(b.discount_pct),
      itemIds: items.filter((i) => i.bundle_id === b.id).map((i) => i.id),
    })
  }
  return defs
}

// ─── Request → cart lines ──────────────────────────────────────────────────

export type BundleCartRequest = {
  /** Active bundle, by handle (wizard) or id (group-order convert). */
  bundle: { handle: string } | { id: string }
  artworkUrl: string | null
  notes: string | null
  items: Array<{
    bundle_item_id: string
    product_handle: string
    lines: Array<{ variant_id: string; quantity: number }>
  }>
}

/**
 * Validate a bundle request against the DB and build priced cart lines.
 * Every garment must be an allowed choice for its item and every variant must
 * belong to that garment; all pricing inputs come from the bundle row.
 */
export async function buildBundleCartLines(
  scope: { resolve: (key: string) => unknown },
  request: BundleCartRequest
): Promise<{ bundle: BundleLike & { discount_pct: number }; lines: ScpAddLineInput[] }> {
  const service = scope.resolve(BUNDLES_MODULE) as BundlesModuleService
  const [bundle] = await service.listBundles({ ...request.bundle, status: "active" }, { take: 1 })
  if (!bundle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This bundle is no longer available.")
  }
  const itemById = new Map(
    (await service.listBundleItems({ bundle_id: bundle.id })).map((i) => [i.id, i])
  )

  for (const requested of request.items) {
    const item = itemById.get(requested.bundle_item_id)
    if (!item) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This bundle has changed since the page loaded. Please refresh and try again."
      )
    }
    if (!allowedHandlesFor(item).has(requested.product_handle)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `"${requested.product_handle}" isn't an option for ${item.label}.`
      )
    }
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["handle", "variants.id"],
    filters: { handle: [...new Set(request.items.map((i) => i.product_handle))], status: "published" },
  })
  const variantsByHandle = new Map(
    ((products ?? []) as Array<{ handle: string; variants?: Array<{ id: string }> }>).map((p) => [
      p.handle,
      new Set((p.variants ?? []).map((v) => v.id)),
    ])
  )

  const addToken = randomUUID()
  const lines: ScpAddLineInput[] = []
  for (const requested of request.items) {
    const item = itemById.get(requested.bundle_item_id)!
    const variants = variantsByHandle.get(requested.product_handle)
    const { metadata, printSizeId } = buildBundleLineMetadata({
      bundle,
      item,
      productHandle: requested.product_handle,
      artworkUrl: request.artworkUrl,
      notes: request.notes,
      addToken,
    })
    for (const line of requested.lines) {
      if (!variants?.has(line.variant_id)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `A selected size/colour is no longer available for ${item.label}. Please refresh and try again.`
        )
      }
      lines.push({ variant_id: line.variant_id, quantity: line.quantity, metadata, print_size_id: printSizeId })
    }
  }
  return { bundle: { ...bundle, discount_pct: Number(bundle.discount_pct) || 0 }, lines }
}

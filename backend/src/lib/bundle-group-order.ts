/**
 * Bundle team orders: a group order whose "base" is a whole bundle. The owner
 * fixes the garment + colour per item; each participant picks one size per
 * sized item; convert turns the roster into priced bundle lines.
 */
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { BUNDLES_MODULE } from "../modules/bundles"
import type BundlesModuleService from "../modules/bundles/service"
import { allowedHandlesFor } from "./bundle-lines"

export type BundleGroupConfig = {
  artwork_url: string | null
  notes: string | null
  items: Array<{ bundle_item_id: string; product_handle: string; color: string | null }>
}

export type BundleGroupItem = {
  bundle_item_id: string
  label: string
  quantity_per_unit: number
  product_handle: string
  product_title: string | null
  thumbnail: string | null
  color: string | null
  /** Empty = one-size item (no size pick needed). */
  sizes: string[]
  variantBySize: Map<string, string>
  /** One-size items: the single variant for the chosen colour. */
  defaultVariantId: string | null
}

const COLOR_RE = /(colou?r|shade)/i
const SIZE_RE = /size/i

type ProductRow = {
  handle: string
  title?: string
  thumbnail?: string | null
  variants?: Array<{
    id: string
    options?: Array<{ value?: string; option?: { title?: string } }>
  }>
}

const optionValue = (
  v: NonNullable<ProductRow["variants"]>[number],
  kind: "color" | "size"
): string | null => {
  const o = (v.options ?? []).find((opt) => {
    const title = opt.option?.title ?? ""
    return kind === "color" ? COLOR_RE.test(title) : SIZE_RE.test(title) && !COLOR_RE.test(title)
  })
  return typeof o?.value === "string" ? o.value : null
}

/** Validate an owner's config against the bundle; returns the normalised config. */
export async function validateBundleGroupConfig(
  scope: { resolve: (key: string) => unknown },
  bundleHandle: string,
  config: BundleGroupConfig
): Promise<{ bundleId: string; config: BundleGroupConfig }> {
  const service = scope.resolve(BUNDLES_MODULE) as BundlesModuleService
  const [bundle] = await service.listBundles({ handle: bundleHandle, status: "active" }, { take: 1 })
  if (!bundle) throw new MedusaError(MedusaError.Types.NOT_FOUND, "This bundle is no longer available.")
  const items = await service.listBundleItems({ bundle_id: bundle.id })
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<string>()
  for (const c of config.items) {
    const item = byId.get(c.bundle_item_id)
    if (!item || seen.has(c.bundle_item_id)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "This bundle has changed — please refresh.")
    }
    seen.add(c.bundle_item_id)
    if (!allowedHandlesFor(item).has(c.product_handle)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${c.product_handle}" isn't an option for ${item.label}.`)
    }
  }
  if (!config.items.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose at least one item for the team pack.")
  }
  return { bundleId: bundle.id, config }
}

/** Resolve the pack's items with the sizes available in each chosen colour. */
export async function loadBundleGroupItems(
  scope: { resolve: (key: string) => unknown },
  bundleId: string,
  config: BundleGroupConfig
): Promise<BundleGroupItem[]> {
  const service = scope.resolve(BUNDLES_MODULE) as BundlesModuleService
  const bundleItems = await service.listBundleItems({ bundle_id: bundleId }, { order: { position: "ASC" } })
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const handles = [...new Set(config.items.map((i) => i.product_handle))]
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "handle",
      "title",
      "thumbnail",
      "variants.id",
      "variants.options.value",
      "variants.options.option.title",
    ],
    filters: { handle: handles, status: "published" },
  })
  const products = new Map(((data ?? []) as ProductRow[]).map((p) => [p.handle, p]))

  const out: BundleGroupItem[] = []
  for (const bi of bundleItems) {
    const chosen = config.items.find((c) => c.bundle_item_id === bi.id)
    if (!chosen) continue
    const product = products.get(chosen.product_handle)
    const variants = (product?.variants ?? []).filter((v) => {
      const colour = optionValue(v, "color")
      return !chosen.color || colour === null || colour === chosen.color
    })
    const variantBySize = new Map<string, string>()
    for (const v of variants) {
      const size = optionValue(v, "size")
      if (size && !variantBySize.has(size)) variantBySize.set(size, v.id)
    }
    out.push({
      bundle_item_id: bi.id,
      label: bi.label,
      quantity_per_unit: bi.quantity_per_unit,
      product_handle: chosen.product_handle,
      product_title: product?.title ?? null,
      thumbnail: product?.thumbnail ?? null,
      color: chosen.color,
      sizes: [...variantBySize.keys()],
      variantBySize,
      defaultVariantId: variantBySize.size ? null : variants[0]?.id ?? null,
    })
  }
  return out
}

/** Throws unless the participant picked a valid size for every sized item. */
export function validateParticipantSizes(
  items: BundleGroupItem[],
  sizes: Record<string, string>
): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const item of items) {
    if (!item.sizes.length) continue
    const pick = sizes[item.bundle_item_id]
    if (!pick || !item.variantBySize.has(pick)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Pick a size for ${item.label}.`)
    }
    clean[item.bundle_item_id] = pick
  }
  return clean
}

/** Roster → aggregated lines per item (pack qty × participant qty). */
export function rosterToBundleLines(
  items: BundleGroupItem[],
  participants: Array<{ id: string; name: string; quantity: number; bundle_sizes?: unknown }>
): {
  items: Array<{ bundle_item_id: string; product_handle: string; lines: Array<{ variant_id: string; quantity: number }> }>
  skipped: Array<{ participant_id: string; name: string; reason: string }>
} {
  const qtyByItemVariant = new Map<string, Map<string, number>>()
  const skipped: Array<{ participant_id: string; name: string; reason: string }> = []
  for (const p of participants) {
    const sizes = ((p.bundle_sizes as { sizes?: Record<string, string> } | null)?.sizes ?? {}) as Record<string, string>
    const resolved: Array<[string, string]> = []
    let missing: string | null = null
    for (const item of items) {
      const variantId = item.sizes.length
        ? item.variantBySize.get(sizes[item.bundle_item_id] ?? "") ?? null
        : item.defaultVariantId
      if (!variantId) {
        missing = item.label
        break
      }
      resolved.push([item.bundle_item_id, variantId])
    }
    if (missing) {
      skipped.push({ participant_id: p.id, name: p.name, reason: `no valid size for ${missing}` })
      continue
    }
    const units = Math.max(1, Number(p.quantity) || 1)
    for (const [itemId, variantId] of resolved) {
      const perUnit = items.find((i) => i.bundle_item_id === itemId)!.quantity_per_unit
      if (!qtyByItemVariant.has(itemId)) qtyByItemVariant.set(itemId, new Map())
      const m = qtyByItemVariant.get(itemId)!
      m.set(variantId, (m.get(variantId) ?? 0) + perUnit * units)
    }
  }
  return {
    items: items
      .filter((i) => qtyByItemVariant.has(i.bundle_item_id))
      .map((i) => ({
        bundle_item_id: i.bundle_item_id,
        product_handle: i.product_handle,
        lines: [...qtyByItemVariant.get(i.bundle_item_id)!].map(([variant_id, quantity]) => ({
          variant_id,
          quantity,
        })),
      })),
    skipped,
  }
}

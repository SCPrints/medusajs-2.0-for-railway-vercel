import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { BRAND_MODULE } from "../../../../modules/brand"
import {
  revalidateStorefrontTags,
  tagsForBrand,
  tagsForCategory,
  tagsForCollection,
  tagsForProduct,
} from "../../../../lib/storefront-revalidate"
import { writeAudit } from "../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../lib/audit-entities"
import { captureEvent } from "../../../../lib/posthog"

/**
 * POST /admin/products-manager/bulk
 *
 * Single endpoint for every bulk action the "Browse & manage" tab can
 * trigger. Discriminated union on `action` so each payload validates
 * cleanly. Per-product success/failure is returned so the UI can show
 * "succeeded 47, failed 3 (with reasons)" + offer a retry-failed.
 *
 * Throttling: no explicit rate limit. Each handler processes products
 * sequentially (or in small chunks for delete) which keeps the
 * sustained write rate well under what the database / Medusa core can
 * handle. If we ever push >1000 products at a time we'll add a token
 * bucket — for now the 1000-id cap on the body keeps the worst case
 * bounded to a few minutes.
 *
 * Side effects: every successful product write triggers a row in the
 * polymorphic audit_log + a PostHog `products_manager_bulk_action`
 * event with action + count. Storefront cache tags are batched and
 * purged once at the end of the run.
 */

const Mode = z.enum(["add", "remove", "replace"])
const ProductStatus = z.enum(["draft", "published", "proposed", "rejected"])

const ChangeStatus = z.object({
  action: z.literal("change_status"),
  payload: z.object({ status: ProductStatus }),
})
const DeleteAction = z.object({
  action: z.literal("delete"),
  payload: z.object({}).optional().nullable(),
})
const SetBrand = z.object({
  action: z.literal("set_brand"),
  payload: z.object({ brand_id: z.string().min(1).nullable() }),
})
const SetType = z.object({
  action: z.literal("set_type"),
  payload: z.object({ type_id: z.string().min(1).nullable() }),
})
const SetTags = z.object({
  action: z.literal("set_tags"),
  payload: z.object({
    tag_ids: z.array(z.string().min(1)),
    mode: Mode,
  }),
})
const SetSalesChannels = z.object({
  action: z.literal("set_sales_channels"),
  payload: z.object({
    sales_channel_ids: z.array(z.string().min(1)),
    mode: Mode,
  }),
})
const SetCategories = z.object({
  action: z.literal("set_categories"),
  payload: z.object({
    category_ids: z.array(z.string().min(1)),
    mode: Mode,
  }),
})
const SetCollection = z.object({
  action: z.literal("set_collection"),
  payload: z.object({ collection_id: z.string().min(1).nullable() }),
})
const SetPrintProfile = z.object({
  action: z.literal("set_print_profile"),
  payload: z.object({ profile_handle: z.string().min(1) }),
})

const BulkAction = z.discriminatedUnion("action", [
  ChangeStatus,
  DeleteAction,
  SetBrand,
  SetType,
  SetTags,
  SetSalesChannels,
  SetCategories,
  SetCollection,
  SetPrintProfile,
])

const bodySchema = z
  .object({
    product_ids: z.array(z.string().min(1)).min(1).max(1000),
  })
  .and(BulkAction)

type BulkActionInput = z.infer<typeof BulkAction>
type ModeT = z.infer<typeof Mode>

type LinkLike = {
  create: (data: Record<string, unknown>) => Promise<unknown>
  dismiss: (data: Record<string, unknown>) => Promise<unknown>
}
type QueryLike = {
  graph: (a: Record<string, unknown>) => Promise<{ data?: any[] }>
}
type ProductModuleLike = {
  updateProducts: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<unknown>
}

type BulkResult = {
  succeeded: string[]
  failed: Array<{ id: string; error: string }>
}

const BATCH_DELETE_SIZE = 50
const CACHE_TAGS_HARD_CAP = 500

function applyMode<T extends string>(
  current: T[],
  next: T[],
  mode: ModeT
): T[] {
  const cur = new Set(current)
  const nxt = new Set(next)
  switch (mode) {
    case "add": {
      const out = new Set(cur)
      for (const v of nxt) out.add(v)
      return [...out]
    }
    case "remove": {
      const out = new Set(cur)
      for (const v of nxt) out.delete(v)
      return [...out]
    }
    case "replace":
      return [...nxt]
  }
}

async function fetchProductsForUpdate(
  query: QueryLike,
  ids: string[]
): Promise<
  Array<{
    id: string
    handle: string | null
    tags: string[]
    categories: string[]
    sales_channels: string[]
    brand_id: string | null
    brand_handle: string | null
    collection_handle: string | null
  }>
> {
  const { data = [] } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "tags.id",
      "categories.id",
      "sales_channels.id",
      "brand.id",
      "brand.handle",
      "collection.handle",
    ],
    filters: { id: ids },
    pagination: { take: ids.length, skip: 0 },
  })

  return (data as any[]).map((p) => {
    const brand = Array.isArray(p?.brand) ? p.brand[0] : p?.brand
    return {
      id: p.id as string,
      handle: (p.handle as string | null) ?? null,
      tags: Array.isArray(p?.tags)
        ? (p.tags.map((t: any) => t?.id).filter(Boolean) as string[])
        : [],
      categories: Array.isArray(p?.categories)
        ? (p.categories.map((c: any) => c?.id).filter(Boolean) as string[])
        : [],
      sales_channels: Array.isArray(p?.sales_channels)
        ? (p.sales_channels.map((s: any) => s?.id).filter(Boolean) as string[])
        : [],
      brand_id: brand?.id ?? null,
      brand_handle: brand?.handle ?? null,
      collection_handle: p?.collection?.handle ?? null,
    }
  })
}

/* ─────────────── per-action handlers ─────────────── */

async function handleChangeStatus(
  productModule: ProductModuleLike,
  ids: string[],
  status: string
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  for (const id of ids) {
    try {
      await productModule.updateProducts(id, { status })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleDelete(
  container: any,
  ids: string[]
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  for (let i = 0; i < ids.length; i += BATCH_DELETE_SIZE) {
    const chunk = ids.slice(i, i + BATCH_DELETE_SIZE)
    try {
      await deleteProductsWorkflow(container).run({ input: { ids: chunk } })
      succeeded.push(...chunk)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      for (const id of chunk) failed.push({ id, error: msg })
    }
  }
  return { succeeded, failed }
}

async function handleSetBrand(
  link: LinkLike,
  query: QueryLike,
  ids: string[],
  brand_id: string | null
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  if (brand_id) {
    const { data } = await query.graph({
      entity: "brand",
      fields: ["id"],
      filters: { id: [brand_id] },
    })
    if (!data?.[0]) {
      const msg = `Brand "${brand_id}" not found.`
      for (const id of ids) failed.push({ id, error: msg })
      return { succeeded, failed }
    }
  }

  const current = await fetchProductsForUpdate(query, ids)
  const currentById = new Map(current.map((p) => [p.id, p]))

  for (const id of ids) {
    const cur = currentById.get(id)
    if (!cur) {
      failed.push({ id, error: "Product not found." })
      continue
    }
    if (cur.brand_id === brand_id) {
      succeeded.push(id) // no-op counts as success
      continue
    }
    try {
      if (cur.brand_id) {
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: id },
          [BRAND_MODULE]: { brand_id: cur.brand_id },
        })
      }
      if (brand_id) {
        await link.create({
          [Modules.PRODUCT]: { product_id: id },
          [BRAND_MODULE]: { brand_id },
        })
      }
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetType(
  productModule: ProductModuleLike,
  ids: string[],
  type_id: string | null
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  for (const id of ids) {
    try {
      await productModule.updateProducts(id, { type_id })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetTags(
  productModule: ProductModuleLike,
  query: QueryLike,
  ids: string[],
  tag_ids: string[],
  mode: ModeT
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  const current = await fetchProductsForUpdate(query, ids)
  const currentById = new Map(current.map((p) => [p.id, p]))

  for (const id of ids) {
    const cur = currentById.get(id)
    if (!cur) {
      failed.push({ id, error: "Product not found." })
      continue
    }
    try {
      const nextIds = applyMode(cur.tags, tag_ids, mode)
      await productModule.updateProducts(id, {
        tags: nextIds.map((tagId) => ({ id: tagId })),
      })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetCategories(
  productModule: ProductModuleLike,
  query: QueryLike,
  ids: string[],
  category_ids: string[],
  mode: ModeT
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  const current = await fetchProductsForUpdate(query, ids)
  const currentById = new Map(current.map((p) => [p.id, p]))

  for (const id of ids) {
    const cur = currentById.get(id)
    if (!cur) {
      failed.push({ id, error: "Product not found." })
      continue
    }
    try {
      const nextIds = applyMode(cur.categories, category_ids, mode)
      await productModule.updateProducts(id, { category_ids: nextIds })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetSalesChannels(
  link: LinkLike,
  query: QueryLike,
  ids: string[],
  sales_channel_ids: string[],
  mode: ModeT
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  const current = await fetchProductsForUpdate(query, ids)
  const currentById = new Map(current.map((p) => [p.id, p]))

  for (const id of ids) {
    const cur = currentById.get(id)
    if (!cur) {
      failed.push({ id, error: "Product not found." })
      continue
    }
    const nextIds = applyMode(cur.sales_channels, sales_channel_ids, mode)
    const toAdd = nextIds.filter((c) => !cur.sales_channels.includes(c))
    const toRemove = cur.sales_channels.filter((c) => !nextIds.includes(c))
    try {
      for (const chId of toRemove) {
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: chId },
        })
      }
      for (const chId of toAdd) {
        await link.create({
          [Modules.PRODUCT]: { product_id: id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: chId },
        })
      }
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetCollection(
  productModule: ProductModuleLike,
  ids: string[],
  collection_id: string | null
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  for (const id of ids) {
    try {
      await productModule.updateProducts(id, { collection_id })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

async function handleSetPrintProfile(
  productModule: ProductModuleLike,
  query: QueryLike,
  ids: string[],
  profile_handle: string
): Promise<BulkResult> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  // Validate the profile exists before touching any product.
  const { data: profileRows = [] } = await query.graph({
    entity: "print_profile",
    fields: ["id", "handle"],
    filters: { handle: profile_handle },
  })
  if (!profileRows.length) {
    const msg = `No print profile with handle "${profile_handle}".`
    for (const id of ids) failed.push({ id, error: msg })
    return { succeeded, failed }
  }

  const { data: products = [] } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: ids },
    pagination: { take: ids.length, skip: 0 },
  })
  const metaById = new Map<string, Record<string, unknown>>(
    (products as any[]).map((p) => [p.id, { ...((p.metadata ?? {}) as Record<string, unknown>) }])
  )

  for (const id of ids) {
    const meta = metaById.get(id)
    if (!meta) {
      failed.push({ id, error: "Product not found." })
      continue
    }
    try {
      meta.print_profile = profile_handle
      // Bulk assignment always uses a stored profile — clear any prior
      // per-product custom override so the assignment is unambiguous.
      delete meta.print_config
      await productModule.updateProducts(id, { metadata: meta })
      succeeded.push(id)
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }
  return { succeeded, failed }
}

/* ─────────────── route ─────────────── */

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const { product_ids, action, payload } = body as any

  const container = req.scope as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as QueryLike
  const link = container.resolve(ContainerRegistrationKeys.LINK) as LinkLike
  const productModule = container.resolve(Modules.PRODUCT) as ProductModuleLike

  const actorId =
    (req as any).auth_context?.actor_id ??
    (req as any).user?.id ??
    null
  const actorEmail =
    (req as any).auth_context?.actor_email ??
    (req as any).user?.email ??
    null

  // Pre-fetch handles/brand/collection metadata for cache-tag building
  // and audit details. Re-used by the link-based handlers so we hand it
  // through where helpful.
  let revalidationTags = new Set<string>(["products"])

  let result: BulkResult
  let auditAction: string
  let actionPayloadForAudit: Record<string, unknown> = {}

  try {
    switch (action) {
      case "change_status": {
        result = await handleChangeStatus(
          productModule,
          product_ids,
          payload.status
        )
        auditAction = AUDIT_ACTION.BULK_STATUS_CHANGED
        actionPayloadForAudit = { status: payload.status }
        break
      }
      case "delete": {
        result = await handleDelete(container, product_ids)
        auditAction = AUDIT_ACTION.BULK_DELETED
        break
      }
      case "set_brand": {
        result = await handleSetBrand(
          link,
          query,
          product_ids,
          payload.brand_id
        )
        auditAction = AUDIT_ACTION.BULK_BRAND_CHANGED
        actionPayloadForAudit = { brand_id: payload.brand_id }
        break
      }
      case "set_type": {
        result = await handleSetType(
          productModule,
          product_ids,
          payload.type_id
        )
        auditAction = AUDIT_ACTION.BULK_TYPE_CHANGED
        actionPayloadForAudit = { type_id: payload.type_id }
        break
      }
      case "set_tags": {
        result = await handleSetTags(
          productModule,
          query,
          product_ids,
          payload.tag_ids,
          payload.mode
        )
        auditAction = AUDIT_ACTION.BULK_TAGS_CHANGED
        actionPayloadForAudit = {
          tag_ids: payload.tag_ids,
          mode: payload.mode,
        }
        break
      }
      case "set_sales_channels": {
        result = await handleSetSalesChannels(
          link,
          query,
          product_ids,
          payload.sales_channel_ids,
          payload.mode
        )
        auditAction = AUDIT_ACTION.BULK_SALES_CHANNELS_CHANGED
        actionPayloadForAudit = {
          sales_channel_ids: payload.sales_channel_ids,
          mode: payload.mode,
        }
        break
      }
      case "set_categories": {
        result = await handleSetCategories(
          productModule,
          query,
          product_ids,
          payload.category_ids,
          payload.mode
        )
        auditAction = AUDIT_ACTION.BULK_CATEGORIES_CHANGED
        actionPayloadForAudit = {
          category_ids: payload.category_ids,
          mode: payload.mode,
        }
        revalidationTags.add(tagsForCategory()[0]!)
        break
      }
      case "set_collection": {
        result = await handleSetCollection(
          productModule,
          product_ids,
          payload.collection_id
        )
        auditAction = AUDIT_ACTION.BULK_COLLECTION_CHANGED
        actionPayloadForAudit = { collection_id: payload.collection_id }
        break
      }
      case "set_print_profile": {
        result = await handleSetPrintProfile(
          productModule,
          query,
          product_ids,
          payload.profile_handle
        )
        auditAction = AUDIT_ACTION.BULK_PRINT_PROFILE_CHANGED
        actionPayloadForAudit = { profile_handle: payload.profile_handle }
        break
      }
      default: {
        res.status(400).json({ message: `Unknown action: ${action}` })
        return
      }
    }
  } catch (err: any) {
    res.status(500).json({
      message: `bulk action failed: ${err?.message ?? err}`,
    })
    return
  }

  /* ─── audit + PostHog ─── */
  if (result.succeeded.length > 0) {
    for (const id of result.succeeded) {
      try {
        await writeAudit({
          container,
          entity: AUDIT_ENTITY.PRODUCT,
          entity_id: id,
          action: auditAction as any,
          actor_id: actorId,
          actor_email: actorEmail,
          details: { ...actionPayloadForAudit, bulk_total: product_ids.length },
        })
      } catch {
        /* writeAudit swallows internally, this catch is belt-and-braces */
      }
    }
    try {
      captureEvent(actorId ?? "system", "products_manager_bulk_action", {
        action,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        total: product_ids.length,
        ...actionPayloadForAudit,
      })
    } catch {
      /* best-effort */
    }
  }

  /* ─── storefront cache invalidation ─── */
  // Only revalidate when there's something to revalidate.
  if (result.succeeded.length > 0 && action !== "delete") {
    try {
      const { data = [] } = await query.graph({
        entity: "product",
        fields: ["id", "handle", "brand.handle", "collection.handle"],
        filters: { id: result.succeeded.slice(0, CACHE_TAGS_HARD_CAP) },
        pagination: {
          take: Math.min(result.succeeded.length, CACHE_TAGS_HARD_CAP),
          skip: 0,
        },
      })
      for (const p of (data as any[]) ?? []) {
        for (const t of tagsForProduct(p?.handle)) revalidationTags.add(t)
        const brand = Array.isArray(p?.brand) ? p.brand[0] : p?.brand
        if (brand?.handle)
          for (const t of tagsForBrand(brand.handle)) revalidationTags.add(t)
        if (p?.collection?.handle)
          for (const t of tagsForCollection(p.collection.handle))
            revalidationTags.add(t)
      }
    } catch {
      // Best-effort enrichment; fall back to the generic "products" tag.
    }
  } else if (result.succeeded.length > 0 && action === "delete") {
    // Deletes invalidate "products" + "brands" + "categories" because the
    // sitemap-style listings on the storefront drop members silently.
    revalidationTags.add("brands")
    revalidationTags.add("categories")
    revalidationTags.add("collections")
  }
  if (revalidationTags.size > 0) {
    void revalidateStorefrontTags([...revalidationTags])
  }

  res.json({
    succeeded: result.succeeded,
    failed: result.failed,
    total: product_ids.length,
  })
}

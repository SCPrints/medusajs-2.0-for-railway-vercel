import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { BRAND_MODULE } from "../../../../../modules/brand"
import type BrandModuleService from "../../../../../modules/brand/service"

const paramsSchema = z.object({ handle: z.string().min(1) })

const arrayString = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional()

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order: z.string().optional(),
  region_id: z.string().optional(),
  type_id: arrayString,
  tag_id: arrayString,
})

const STORE_PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "description",
  "handle",
  "is_giftcard",
  "discountable",
  "thumbnail",
  "collection_id",
  "type_id",
  "weight",
  "created_at",
  "updated_at",
  "metadata",
  "type.*",
  "collection.*",
  "options.*",
  "options.values.*",
  "tags.*",
  "images.*",
  "variants.*",
  "variants.options.*",
  "variants.calculated_price.*",
  "variants.inventory_quantity",
  "variants.metadata",
  "variants.sku",
  "variants.weight",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "brand.*",
]

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})
  const q = querySchema.parse(req.query ?? {})

  const brandService = req.scope.resolve<BrandModuleService>(BRAND_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  const [brands] = await brandService.listAndCountBrands(
    { handle, is_active: true },
    { take: 1 }
  )
  const brand = brands[0]
  if (!brand) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Brand "${handle}" not found.`
    )
  }

  // Read product IDs from the Module Link table — single source of truth.
  // Drift is detected by `verify-brand-links` and repaired by
  // `relink-supplier-brands`, not silently papered over here.
  const linkRows: Array<{ product_id: string }> = await pgConnection(
    "product_product_brand_brand"
  )
    .where({ brand_id: brand.id })
    .whereNull("deleted_at")
    .select("product_id")

  const brandProductIds: string[] = linkRows
    .map((r) => r?.product_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  if (brandProductIds.length === 0) {
    res.json({
      products: [],
      count: 0,
      offset: q.offset,
      limit: q.limit,
    })
    return
  }

  const filters: Record<string, any> = {
    id: brandProductIds,
    status: ProductStatus.PUBLISHED,
  }
  if (q.type_id?.length) {
    filters.type_id = q.type_id
  }
  if (q.tag_id?.length) {
    filters.tags = { id: q.tag_id }
  }

  const salesChannelIds: string[] | undefined = (req as any)
    .publishable_key_context?.sales_channel_ids
  if (Array.isArray(salesChannelIds) && salesChannelIds.length) {
    filters.sales_channels = { id: salesChannelIds }
  }

  const context: Record<string, any> = {}
  if (q.region_id) {
    const regionRes = await query.graph({
      entity: "region",
      fields: ["id", "currency_code"],
      filters: { id: q.region_id },
      pagination: { take: 1, skip: 0 },
    })
    const region = (regionRes.data ?? [])[0]
    if (region) {
      context.variants = {
        calculated_price: QueryContext({
          region_id: region.id,
          currency_code: region.currency_code,
        }),
      }
    }
  }

  let orderConfig: Record<string, "ASC" | "DESC"> | undefined
  if (q.order) {
    const desc = q.order.startsWith("-")
    const field = desc ? q.order.slice(1) : q.order
    if (field) {
      orderConfig = { [field]: desc ? "DESC" : "ASC" }
    }
  }

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: STORE_PRODUCT_FIELDS,
    filters,
    pagination: {
      take: q.limit,
      skip: q.offset,
      ...(orderConfig ? { order: orderConfig } : {}),
    },
    context,
  })

  // AP products store every variant image at the product level (~60 images per
  // style) because the AP API nests images per variant. Listing cards don't need
  // product.images — they read garment_images.front from variant metadata.
  // Strip the array here so the listing payload isn't 10× larger than other brands.
  // The PDP uses a different route and still receives the full image gallery.
  const trimmedProducts = (products ?? []).map((p: any) => {
    if (p.metadata?.source === "aussiepacific") {
      return { ...p, images: [] }
    }
    return p
  })

  res.json({
    products: trimmedProducts,
    count: metadata?.count ?? 0,
    offset: q.offset,
    limit: q.limit,
  })
}

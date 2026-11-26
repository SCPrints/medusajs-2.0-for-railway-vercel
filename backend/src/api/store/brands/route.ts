import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { BRAND_MODULE } from "../../../modules/brand"
import type BrandModuleService from "../../../modules/brand/service"
import { countPublishedProductsByBrand } from "../../../lib/brand-product-counts"

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = listQuerySchema.parse(req.query ?? {})
  const brandService = req.scope.resolve<BrandModuleService>(BRAND_MODULE)
  const pgConnection = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as any

  const [brands, count] = await brandService.listAndCountBrands(
    { is_active: true },
    {
      take: query.limit ?? 200,
      skip: query.offset ?? 0,
      order: { name: "ASC" },
    }
  )

  const counts = await countPublishedProductsByBrand(
    pgConnection,
    brands.map((b) => b.id)
  )

  res.json({
    brands: brands.map((b) => ({ ...b, product_count: counts[b.id] ?? 0 })),
    count,
    limit: query.limit ?? 200,
    offset: query.offset ?? 0,
  })
}

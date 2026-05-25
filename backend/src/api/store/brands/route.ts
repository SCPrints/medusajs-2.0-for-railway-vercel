import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { BRAND_MODULE } from "../../../modules/brand"
import type BrandModuleService from "../../../modules/brand/service"

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

  const brandIds = brands.map((b) => b.id)
  const counts: Record<string, number> = Object.fromEntries(
    brandIds.map((id) => [id, 0])
  )
  if (brandIds.length > 0) {
    const rows: Array<{ brand_id: string; count: string | number }> =
      await pgConnection("product_product_brand_brand")
        .whereIn("brand_id", brandIds)
        .whereNull("deleted_at")
        .groupBy("brand_id")
        .select("brand_id")
        .count<{ count: string }>("product_id as count")
    for (const r of rows) {
      counts[r.brand_id] = Number(r.count) || 0
    }
  }

  res.json({
    brands: brands.map((b) => ({ ...b, product_count: counts[b.id] ?? 0 })),
    count,
    limit: query.limit ?? 200,
    offset: query.offset ?? 0,
  })
}

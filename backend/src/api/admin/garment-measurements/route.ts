import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { GARMENT_MEASUREMENT_MODULE } from "../../../modules/garment-measurement"
import type GarmentMeasurementModuleService from "../../../modules/garment-measurement/service"
import { isGarmentType, sizeStatus, sortSizes } from "../../../lib/garment-measurements"

/**
 * GET /admin/garment-measurements — every product that has measurements, with
 * each size's state, for the "3D measurements" page.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<GarmentMeasurementModuleService>(GARMENT_MEASUREMENT_MODULE)
  // ponytail: loads every row (~30 per size); add a grouped SQL query once there are hundreds of products.
  const rows = await service.listGarmentMeasurements(
    {},
    { take: 50000, select: ["product_id", "garment_type", "size", "key", "value_cm", "estimated", "measured_at"] }
  )
  const byProduct = new Map<string, typeof rows>()
  for (const r of rows) byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r])

  const ids = [...byProduct.keys()]
  const { data: products } = ids.length
    ? await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product",
        fields: ["id", "title", "thumbnail"],
        filters: { id: ids },
      })
    : { data: [] as { id: string; title: string; thumbnail: string | null }[] }

  const list = products
    .map((p: { id: string; title: string; thumbnail: string | null }) => {
      const mine = byProduct.get(p.id) ?? []
      const type = mine.find((r) => isGarmentType(r.garment_type))?.garment_type
      const t = isGarmentType(type) ? type : "tee"
      const sizes = sortSizes(Array.from(new Set(mine.map((r) => r.size))))
      return {
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        garment_type: t,
        status: Object.fromEntries(sizes.map((s) => [s, sizeStatus(t, mine.filter((r) => r.size === s))])),
        last_measured_at: mine.reduce((a, r) => (new Date(r.measured_at) > a ? new Date(r.measured_at) : a), new Date(0)),
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))

  res.json({ products: list })
}

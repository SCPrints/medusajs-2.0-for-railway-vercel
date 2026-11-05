import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { GARMENT_MEASUREMENT_MODULE } from "../../modules/garment-measurement"
import type GarmentMeasurementModuleService from "../../modules/garment-measurement/service"
import { inferGarmentType, isGarmentType, sortSizes, type GarmentType } from "../../lib/garment-measurements"

/** The product, its size labels, its recorded rows and its garment type. Shared by the GET/POST and export routes. */
export async function loadProductMeasurements(req: MedusaRequest, productId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "options.title", "options.values.value"],
    filters: { id: productId },
  })
  const product = data?.[0] as
    | { id: string; title: string; handle: string; thumbnail: string | null; options?: { title: string; values?: { value: string }[] }[] }
    | undefined
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")

  const service = req.scope.resolve<GarmentMeasurementModuleService>(GARMENT_MEASUREMENT_MODULE)
  const rows = await service.listGarmentMeasurements({ product_id: productId }, { take: 2000 })

  const sizeOption = product.options?.find((o) => /size/i.test(o.title))
  const optionSizes = sizeOption?.values?.map((v) => v.value) ?? []
  const sizes = sortSizes(Array.from(new Set([...optionSizes, ...rows.map((r) => r.size)])))

  const counts = new Map<string, number>()
  for (const r of rows) if (isGarmentType(r.garment_type)) counts.set(r.garment_type, (counts.get(r.garment_type) ?? 0) + 1)
  const stored = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as GarmentType | undefined

  return {
    product: { id: product.id, title: product.title, handle: product.handle, thumbnail: product.thumbnail },
    sizes: sizes.length ? sizes : ["One size"],
    garment_type: stored ?? inferGarmentType(product.title),
    rows,
    service,
  }
}

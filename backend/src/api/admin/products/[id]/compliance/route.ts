import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { cleanCompliance, mergeCompliance } from "../../../../../lib/compliance"
import { metadataPatch } from "../../../../../lib/metadata-patch"
import { revalidateStorefrontTags, tagsForProduct } from "../../../../../lib/storefront-revalidate"

const bodySchema = z.object({ compliance: z.record(z.string(), z.unknown()).nullable() })

async function load(req: MedusaRequest, id: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata", "brand.*"],
    filters: { id: [id] },
  })
  const product = data?.[0]
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand
  return { product, brandDefault: cleanCompliance(brand?.metadata?.compliance) }
}

/** GET /admin/products/:id/compliance → { compliance, brand_default, merged } */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { product, brandDefault } = await load(req, req.params.id)
  const own = cleanCompliance(product.metadata?.compliance)
  res.json({ compliance: own, brand_default: brandDefault, merged: mergeCompliance(brandDefault, own) })
}

/** POST body { compliance: {...} | null } (null clears). Spreads existing metadata. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.safeParse(req.body ?? {})
  if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "compliance must be an object or null")
  const { product, brandDefault } = await load(req, req.params.id)
  const next = { ...(product.metadata ?? {}) } as Record<string, unknown>
  const own = cleanCompliance(body.data.compliance)
  if (own) next.compliance = own
  else delete next.compliance
  await req.scope.resolve(Modules.PRODUCT).updateProducts(product.id, { metadata: metadataPatch(product.metadata, next) })
  void revalidateStorefrontTags(tagsForProduct(product.handle))
  res.json({ compliance: own, brand_default: brandDefault, merged: mergeCompliance(brandDefault, own) })
}

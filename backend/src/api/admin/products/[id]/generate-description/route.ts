import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { generateProductDescriptions } from "../../../../../services/ai-copy/generate"
import {
  AI_DESC_PRODUCT_FIELDS,
  productToContext,
} from "../../../../../services/ai-copy/context"

const generateSchema = z.object({
  /** Optional hint to bias the model — e.g. "winter, casual",
   *  "performance team kit", etc. */
  hint: z.string().max(200).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id
  if (!productId) {
    return res.status(400).json({ error: "id required" })
  }

  // Parse body but tolerate missing — it's all optional.
  let body: z.infer<typeof generateSchema> = {}
  try {
    body = generateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: [...AI_DESC_PRODUCT_FIELDS],
    filters: { id: productId },
  })
  const product = (products as any[])?.[0]
  if (!product) {
    return res.status(404).json({ error: "product_not_found" })
  }

  if (!product.title || String(product.title).trim().length === 0) {
    return res.status(400).json({
      error: "product_missing_title",
      detail:
        "Product needs a title before an AI description can be generated.",
    })
  }

  const ctx = productToContext(product, body.hint)

  const result = await generateProductDescriptions(ctx)

  if (result.ok === false) {
    const statusMap = {
      not_configured: 503,
      timeout: 504,
      rate_limited: 429,
      upstream: 502,
      empty: 502,
    } as const
    return res.status(statusMap[result.error]).json({
      error: result.error,
      detail: result.detail ?? null,
    })
  }

  res.json({
    drafts: result.drafts,
    provider: result.provider,
    model: result.model,
  })
}

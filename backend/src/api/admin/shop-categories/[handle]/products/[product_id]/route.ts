import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { TREE } from "../../../../../../lib/shop-categories"

/**
 * DELETE /admin/shop-categories/:handle/products/:product_id
 *
 * Remove a single product from a Shop-tree category. Surgical fix for
 * a misclassified product (e.g. a kids' jumper that landed in
 * `corporates-knitwear`). Preserves the product's other category
 * memberships — never touches anything outside the targeted category.
 *
 * Idempotent: a product not currently in the category returns 200
 * with `{ removed: false, reason: "not_in_category" }` rather than
 * 404, so the admin UI can fire the delete optimistically without
 * caring about race conditions.
 */

const paramsSchema = z.object({
  handle: z.string().trim().min(1).max(120),
  product_id: z.string().trim().min(1),
})

function isShopTreeHandle(handle: string): boolean {
  return TREE.some(
    (audience) =>
      handle === audience.handle ||
      audience.children.some(
        (sub) => `${audience.handle}-${sub.handle}` === handle
      )
  )
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { handle, product_id } = paramsSchema.parse(req.params ?? {})

  if (!isShopTreeHandle(handle)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `"${handle}" is not a Shop-tree category.`
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id"],
    filters: { handle },
  })
  const category = (categories ?? [])[0] as { id: string } | undefined
  if (!category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Category "${handle}" not found.`
    )
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "categories.id"],
    filters: { id: product_id },
  })
  const product = (products ?? [])[0] as
    | { id: string; title: string; categories: Array<{ id: string }> | null }
    | undefined
  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product "${product_id}" not found.`
    )
  }

  const currentIds = (product.categories ?? []).map((c) => c.id)
  if (!currentIds.includes(category.id)) {
    res.json({
      removed: false,
      reason: "not_in_category",
      product_id: product.id,
    })
    return
  }

  const remainingIds = currentIds.filter((id) => id !== category.id)

  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (
      id: string,
      data: { category_ids?: string[] }
    ) => Promise<unknown>
  }

  await productModule.updateProducts(product.id, {
    category_ids: remainingIds,
  })

  res.json({
    removed: true,
    product_id: product.id,
    product_title: product.title,
    remaining_categories: remainingIds.length,
  })
}

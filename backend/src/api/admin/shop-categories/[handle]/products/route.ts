import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { TREE } from "../../../../../lib/shop-categories"

/**
 * GET  /admin/shop-categories/:handle/products
 * POST /admin/shop-categories/:handle/products
 *
 * GET — paginated list of products linked to the Shop-tree category.
 *       Returns the basics the management drawer renders: title,
 *       thumbnail, status, type. Defaults to 50 per page; orderable by
 *       `created_at` ascending so newest-imports surface at the bottom
 *       (staff usually want to spot-check the freshest entries).
 *
 * POST — bulk-assign one or many products to this category. Idempotent
 *       per product (skips if already linked). Adds to the existing
 *       category_ids set so other categories survive.
 */

const paramsSchema = z.object({
  handle: z.string().trim().min(1).max(120),
})

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  /** Optional substring filter against title — handy when scrubbing
   *  through a category with hundreds of products. */
  q: z.string().trim().max(120).optional(),
})

const assignBodySchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(500),
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

async function fetchCategoryByHandle(
  req: MedusaRequest,
  handle: string
): Promise<{ id: string; name: string } | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    filters: { handle },
  })
  return ((data ?? [])[0] as { id: string; name: string } | undefined) ?? null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})
  const { limit, offset, q } = listQuerySchema.parse(req.query ?? {})

  if (!isShopTreeHandle(handle)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `"${handle}" is not a Shop-tree category.`
    )
  }

  const category = await fetchCategoryByHandle(req, handle)
  if (!category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Category "${handle}" not found.`
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const filters: Record<string, unknown> = {
    categories: { id: category.id },
    status: "published",
  }
  if (q) {
    // Medusa's graph layer supports an `$ilike` operator for case-insensitive
    // substring matching; safer than building a raw SQL `LIKE`. Strip LIKE
    // wildcards (%/_) so a literal "%" doesn't match every product.
    filters.title = { $ilike: `%${q.replace(/[%_]/g, "")}%` }
  }

  const { data, metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "thumbnail",
      "type.value",
      "tags.value",
      "brand.handle",
      "brand.name",
    ],
    filters,
    pagination: {
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    },
  })

  res.json({
    category: { id: category.id, handle, name: category.name },
    products: data ?? [],
    pagination: {
      limit,
      offset,
      total: metadata?.count ?? null,
    },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})
  const { product_ids } = assignBodySchema.parse(req.body ?? {})

  if (!isShopTreeHandle(handle)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `"${handle}" is not a Shop-tree category.`
    )
  }

  const category = await fetchCategoryByHandle(req, handle)
  if (!category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Category "${handle}" not found.`
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProducts: (
      id: string,
      data: { category_ids?: string[] }
    ) => Promise<unknown>
  }

  // Pull existing category_ids per product so we can append idempotently
  // without clobbering any other categories (brand-specific, audience
  // cross-listing, manual pins, etc.).
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "categories.id"],
    filters: { id: product_ids },
  })

  const summary = {
    requested: product_ids.length,
    found: (products ?? []).length,
    added: 0,
    already_assigned: 0,
    failures: 0,
    failure_samples: [] as Array<{ id: string; reason: string }>,
  }

  for (const product of (products ?? []) as Array<{
    id: string
    title: string
    categories: Array<{ id: string }> | null
  }>) {
    const currentIds = new Set(
      (product.categories ?? []).map((c) => c.id)
    )
    if (currentIds.has(category.id)) {
      summary.already_assigned++
      continue
    }
    currentIds.add(category.id)
    try {
      await productModule.updateProducts(product.id, {
        category_ids: Array.from(currentIds),
      })
      summary.added++
    } catch (err: any) {
      summary.failures++
      if (summary.failure_samples.length < 5) {
        summary.failure_samples.push({
          id: product.id,
          reason: err?.message ?? "unknown error",
        })
      }
    }
  }

  res.json({
    category: { id: category.id, handle, name: category.name },
    ...summary,
  })
}

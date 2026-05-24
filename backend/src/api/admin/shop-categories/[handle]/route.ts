import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { TREE } from "../../../../lib/shop-categories"

/**
 * GET /admin/shop-categories/:handle
 * POST /admin/shop-categories/:handle
 *
 * Read and update a single Shop-tree category. Read returns the
 * canonical metadata staff need to manage it (name, audience parent,
 * `is_active`, `metadata.is_hidden_from_menu`, label override, product
 * count). Update is restricted to the small set of fields the mega-menu
 * cares about — anything broader belongs on the standard
 * `/admin/product-categories/:id` endpoint.
 *
 * Lookup is by **handle** (e.g. `mens-t-shirts`) so the admin UI never
 * needs to round-trip an ID — the handle is the stable key everywhere
 * else in the codebase.
 */

const paramsSchema = z.object({
  handle: z.string().trim().min(1).max(120),
})

const updateBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** Toggles `metadata.is_hidden_from_menu`. Storefront mega-menu skips
   *  categories with this flag — direct `/categories/<handle>` URLs still
   *  work, so it's safe to hide a low-quality category from drill-down
   *  without breaking deep links. */
  is_hidden_from_menu: z.boolean().optional(),
})

type CategoryRow = {
  id: string
  name: string
  handle: string
  is_active: boolean
  metadata: Record<string, unknown> | null
  parent_category: { id: string; handle: string; name: string } | null
}

async function fetchCategoryByHandle(
  req: MedusaRequest,
  handle: string
): Promise<CategoryRow | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "product_category",
    fields: [
      "id",
      "name",
      "handle",
      "is_active",
      "metadata",
      "parent_category.id",
      "parent_category.handle",
      "parent_category.name",
    ],
    filters: { handle },
  })
  return ((data ?? [])[0] as CategoryRow) ?? null
}

function isShopTreeHandle(handle: string): boolean {
  return TREE.some(
    (audience) =>
      handle === audience.handle ||
      audience.children.some(
        (sub) => `${audience.handle}-${sub.handle}` === handle
      )
  )
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})

  if (!isShopTreeHandle(handle)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `"${handle}" is not a Shop-tree category. Use /admin/product-categories for non-shop categories.`
    )
  }

  const category = await fetchCategoryByHandle(req, handle)
  if (!category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Category "${handle}" not found. Run ensureCategoryTree() or the setup-shop-categories script to materialise the tree.`
    )
  }

  // Cheap product count for the drawer header — full list lives on the
  // /products sub-route.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { metadata: productMeta } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { categories: { id: category.id }, status: "published" },
    pagination: { take: 1, skip: 0 },
  })

  res.json({
    category: {
      id: category.id,
      name: category.name,
      handle: category.handle,
      is_active: category.is_active,
      metadata: category.metadata ?? {},
      is_hidden_from_menu:
        (category.metadata?.is_hidden_from_menu as boolean | undefined) ??
        false,
      parent: category.parent_category
        ? {
            id: category.parent_category.id,
            handle: category.parent_category.handle,
            name: category.parent_category.name,
          }
        : null,
      product_count: productMeta?.count ?? null,
    },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { handle } = paramsSchema.parse(req.params ?? {})
  const body = updateBodySchema.parse(req.body ?? {})

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

  const productModule = req.scope.resolve(Modules.PRODUCT) as {
    updateProductCategories: (
      id: string,
      data: { name?: string; metadata?: Record<string, unknown> | null }
    ) => Promise<unknown>
  }

  const patch: { name?: string; metadata?: Record<string, unknown> } = {}
  if (typeof body.name === "string") {
    patch.name = body.name
  }
  if (typeof body.is_hidden_from_menu === "boolean") {
    // Merge into existing metadata so we don't clobber other keys staff
    // may have set on the category row.
    patch.metadata = {
      ...(category.metadata ?? {}),
      is_hidden_from_menu: body.is_hidden_from_menu,
    }
  }

  if (Object.keys(patch).length === 0) {
    res.json({ category, changed: false })
    return
  }

  await productModule.updateProductCategories(category.id, patch)

  const updated = await fetchCategoryByHandle(req, handle)
  res.json({
    category: {
      id: updated?.id ?? category.id,
      name: updated?.name ?? category.name,
      handle: updated?.handle ?? category.handle,
      is_active: updated?.is_active ?? category.is_active,
      metadata: updated?.metadata ?? {},
      is_hidden_from_menu:
        (updated?.metadata?.is_hidden_from_menu as boolean | undefined) ??
        false,
    },
    changed: true,
  })
}

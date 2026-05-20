import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { revalidateStorefrontTags, tagsForCategory } from "../lib/storefront-revalidate"

/**
 * Storefront cache purge whenever a product category changes. The storefront's
 * category data fetchers (`listCategories`, `getCategoryByHandle`) are tagged
 * `categories`; we purge the whole tag on any change rather than computing
 * the specific `category-{path}` tag, because:
 *   1. listCategories caches the whole tree shape, which any change affects
 *   2. The per-path tag uses the full path slug array (`category-mens/tshirts`),
 *      which we'd have to walk parent_category to reconstruct — not worth it
 *      for what's already a cheap purge.
 */
export default async function productCategoryCacheInvalidateHandler({
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  await revalidateStorefrontTags(tagsForCategory(), logger)
}

export const config: SubscriberConfig = {
  event: [
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
  ],
}

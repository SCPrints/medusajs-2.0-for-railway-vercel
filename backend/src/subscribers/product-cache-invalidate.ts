import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IProductModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { revalidateStorefrontTags, tagsForProduct } from "../lib/storefront-revalidate"

/**
 * Storefront cache purge whenever a product changes. The storefront uses
 * Next 16 Cache Components with `'use cache'` on product fetchers tagged
 * `products` (catalog list) and `product-{handle}` (single PDP).
 *
 * Without this subscriber, admin product edits show up after the catalog's
 * `cacheLife` window (default 120s); with it, edits are visible within a
 * second on the live site.
 *
 * Failure is silent + logged — the storefront stays stale at most one
 * `cacheLife` window if the purge can't be delivered.
 */
export default async function productCacheInvalidateHandler({
  event: { data, name },
  container,
}: SubscriberArgs<{ id: string }>) {
  const productId = data?.id
  if (!productId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  let handle: string | null = null
  if (name !== "product.deleted") {
    // For created/updated we can fetch the product to get its handle.
    // For deletes the row is already gone — we just purge the catalog tag.
    try {
      const productModuleService: IProductModuleService = container.resolve(Modules.PRODUCT)
      const product = await productModuleService.retrieveProduct(productId, {
        select: ["handle"],
      })
      handle = product?.handle ?? null
    } catch {
      // Soft-fail: still purge the catalog tag below
    }
  }

  await revalidateStorefrontTags(tagsForProduct(handle), logger)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}

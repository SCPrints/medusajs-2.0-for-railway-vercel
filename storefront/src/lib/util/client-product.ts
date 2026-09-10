import { HttpTypes } from "@medusajs/types"

/**
 * Slim a Medusa product for the client boundary.
 *
 * Why: a StoreProduct straight from `getProductByHandle` carries ~2.6KB per
 * variant — full nested option objects with timestamps, raw price amounts,
 * customs codes, dimensions, `deleted_at`, etc. The 70-colour Staple Tee has
 * 570 variants, and the PDP hands `product` to ~7 client components across two
 * renders (static shell + dynamic studio slot), so the RSC payload was 3.6MB
 * of the page's 3.9MB HTML (measured 2026-09-10; field p90 LCP 13s on that
 * PDP). Client code only reads a handful of variant fields; everything else
 * is dead weight the browser has to download and parse before hydration.
 *
 * This is an ALLOWLIST of what client code actually reads (grep'd across
 * modules/customizer, modules/products, lib/util on 2026-09-10). If a client
 * component starts reading a new variant/option/image field, add it here —
 * a missing field shows up as `undefined` on the client, not a crash.
 *
 * Product-level fields are passed through untouched (they're one object, not
 * one-per-variant). Server components should keep receiving the full product.
 */
export function toClientProduct(
  product: HttpTypes.StoreProduct
): HttpTypes.StoreProduct {
  const variants = (product.variants ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    sku: v.sku,
    product_id: v.product_id,
    variant_rank: v.variant_rank,
    manage_inventory: v.manage_inventory,
    allow_backorder: v.allow_backorder,
    inventory_quantity: v.inventory_quantity,
    metadata: v.metadata,
    options: (v.options ?? []).map((o) => ({
      id: o.id,
      value: o.value,
      option_id: o.option_id,
      option: o.option ? { id: o.option.id, title: o.option.title } : o.option,
    })),
    calculated_price: v.calculated_price
      ? {
          calculated_amount: v.calculated_price.calculated_amount,
          original_amount: v.calculated_price.original_amount,
          currency_code: v.calculated_price.currency_code,
          is_calculated_price_price_list:
            v.calculated_price.is_calculated_price_price_list,
          is_calculated_price_tax_inclusive:
            v.calculated_price.is_calculated_price_tax_inclusive,
          is_original_price_price_list:
            v.calculated_price.is_original_price_price_list,
          is_original_price_tax_inclusive:
            v.calculated_price.is_original_price_tax_inclusive,
          calculated_price: v.calculated_price.calculated_price
            ? {
                price_list_type:
                  v.calculated_price.calculated_price.price_list_type,
              }
            : undefined,
        }
      : v.calculated_price,
  }))

  const options = (product.options ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    product_id: o.product_id,
    metadata: o.metadata,
    values: (o.values ?? []).map((val) => ({
      id: val.id,
      value: val.value,
      option_id: val.option_id,
      metadata: val.metadata,
    })),
  }))

  const images = (product.images ?? []).map((img) => ({
    id: img.id,
    url: img.url,
    rank: img.rank,
  }))

  return {
    ...product,
    variants,
    options,
    images,
  } as unknown as HttpTypes.StoreProduct
}

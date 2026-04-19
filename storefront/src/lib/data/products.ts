import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { getRegion } from "./regions"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"
import { sortProducts } from "@lib/util/sort-products"

/** Include variant metadata (e.g. garment_images) for PDP gallery + swatches. */
const STORE_PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,+variants.metadata"

export const getProductsById = cache(async function ({
  ids,
  regionId,
}: {
  ids: string[]
  regionId: string
}) {
  return sdk.store.product
    .list(
      {
        id: ids,
        region_id: regionId,
        fields: STORE_PRODUCT_FIELDS,
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products }) => products)
})

export const getProductByHandle = cache(async function (
  handle: string,
  regionId: string
) {
  return sdk.store.product
    .list(
      {
        handle,
        region_id: regionId,
        fields: STORE_PRODUCT_FIELDS,
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products }) => products[0])
})

export const getProductsList = cache(async function ({
  pageParam = 1,
  queryParams,
  countryCode,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  const limit = queryParams?.limit || 12
  const validPageParam = Math.max(pageParam, 1);
  const offset = (validPageParam - 1) * limit
  const region = await getRegion(countryCode)

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }
  return sdk.store.product
    .list(
      {
        limit,
        offset,
        region_id: region.id,
        fields: STORE_PRODUCT_FIELDS,
        ...queryParams,
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
})

/**
 * This will fetch 100 products to the Next.js cache and sort them based on the sortBy parameter.
 * It will then return the paginated products based on the page and limit parameters.
 */
export const getProductsListWithSort = cache(async function ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  filters,
  countryCode,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  filters?: ProductFilters
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  const limit = queryParams?.limit || 12
  const getMetadataValue = (product: HttpTypes.StoreProduct, keys: string[]) => {
    const metadata = (product.metadata ?? {}) as Record<string, unknown>

    for (const key of keys) {
      const value = metadata[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }

    return null
  }

  const {
    response: { products, count },
  } = await getProductsList({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      limit: 100,
    },
    countryCode,
  })

  const filteredProducts = products.filter((product) => {
    const variantPrices = (product.variants ?? [])
      .map((variant) => variant?.calculated_price?.calculated_amount)
      .filter((price): price is number => typeof price === "number")
    const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null
    const hasStock = (product.variants ?? []).some(
      (variant) =>
        (variant as HttpTypes.StoreProductVariant)?.inventory_quantity === undefined ||
        (variant as HttpTypes.StoreProductVariant)?.inventory_quantity === null ||
        (variant as HttpTypes.StoreProductVariant).inventory_quantity! > 0
    )
    const brand = getMetadataValue(product, ["brand", "manufacturer", "label"])?.toLowerCase()
    const fabric = getMetadataValue(product, [
      "fabric_type",
      "fabric",
      "material",
      "composition",
    ])?.toLowerCase()

    if (typeof filters?.minPrice === "number") {
      if (minVariantPrice === null || minVariantPrice < filters.minPrice) {
        return false
      }
    }

    if (typeof filters?.maxPrice === "number") {
      if (minVariantPrice === null || minVariantPrice > filters.maxPrice) {
        return false
      }
    }

    if (filters?.inStock && !hasStock) {
      return false
    }

    if (filters?.brand && brand && !brand.includes(filters.brand.toLowerCase())) {
      return false
    }

    if (filters?.brand && !brand) {
      return false
    }

    if (filters?.fabric && fabric && !fabric.includes(filters.fabric.toLowerCase())) {
      return false
    }

    if (filters?.fabric && !fabric) {
      return false
    }

    return true
  })

  const sortedProducts = sortProducts(filteredProducts, sortBy)

  const pageParam = (page - 1) * limit

  const filteredCount = sortedProducts.length
  const nextPage = filteredCount > pageParam + limit ? pageParam + limit : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count: filteredCount,
    },
    nextPage,
    queryParams,
  }
})

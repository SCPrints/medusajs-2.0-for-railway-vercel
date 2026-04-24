import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { getRegion } from "./regions"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"
import { sortProducts } from "@lib/util/sort-products"

function productBrandMatchesClientFilter(
  productBrandLower: string,
  filterRaw: string
): boolean {
  const f = filterRaw.trim().toLowerCase()
  if (productBrandLower.includes(f)) {
    return true
  }
  if (f === "ramo") {
    return (
      productBrandLower.includes("ramo") ||
      productBrandLower.includes("stanley") ||
      productBrandLower.includes("stella")
    )
  }
  return false
}

/** Include product + variant metadata (e.g. brand, garment_images) and tags for the storefront. */
const STORE_PRODUCT_FIELDS =
  "+metadata,*variants.calculated_price,+variants.inventory_quantity,+variants.metadata,+tags"

/**
 * Next.js Data Cache: tag for on-demand `revalidateTag("products")`, plus a max age so catalog
 * changes (e.g. Draft after trim script) are not served forever without a redeploy.
 */
const PRODUCT_LIST_FETCH_INIT = {
  next: { tags: ["products"] as const, revalidate: 120 },
}

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
      PRODUCT_LIST_FETCH_INIT
    )
    .then(({ products }) => products)
})

export async function getProductByHandle(
  handle: string,
  regionId?: string | null
) {
  const normalizedHandle = decodeURIComponent(String(handle ?? "")).trim().toLowerCase()
  if (!normalizedHandle) {
    return null
  }

  const baseParams: HttpTypes.FindParams & HttpTypes.StoreProductParams = {
    handle: normalizedHandle,
    fields: STORE_PRODUCT_FIELDS,
  }

  if (!regionId) {
    return null
  }

  try {
    const { products } = await sdk.store.product.list(
      {
        ...baseParams,
        region_id: regionId,
      },
      PRODUCT_LIST_FETCH_INIT
    )

    return products[0] ?? null
  } catch {
    return null
  }
}

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
      PRODUCT_LIST_FETCH_INIT
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

    if (filters?.brand) {
      if (!brand) {
        return false
      }
      if (!productBrandMatchesClientFilter(brand, filters.brand)) {
        return false
      }
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

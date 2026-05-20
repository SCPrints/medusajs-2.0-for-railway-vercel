import { sdk } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"

export async function listCategories() {
  "use cache"
  cacheTag("categories")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return sdk.store.category
    .list({ fields: "+category_children" })
    .then(({ product_categories }) => product_categories)
}

export async function getCategoriesList(
  offset: number = 0,
  limit: number = 100
) {
  "use cache"
  cacheTag("categories")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return sdk.store.category.list(
    // @ts-ignore — SDK preview types
    { limit, offset }
  )
}

export async function getCategoryByHandle(categoryHandle: string[]) {
  "use cache"
  cacheTag("categories", `category-${categoryHandle.join("/")}`)
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  // `+category_children` includes the immediate sub-category list so the
  // landing page can render its drill-down without a second round trip.
  return sdk.store.category.list(
    // @ts-ignore — SDK preview types lag the handle param
    {
      handle: categoryHandle,
      fields: "+category_children,+parent_category",
    }
  )
}

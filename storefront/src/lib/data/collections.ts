import { sdk } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"
import { getProductsList } from "./products"
import { HttpTypes } from "@medusajs/types"

export async function retrieveCollection(id: string) {
  "use cache"
  cacheTag("collections", `collection-${id}`)
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return sdk.store.collection
    .retrieve(id)
    .then(({ collection }) => collection)
}

export async function getCollectionsList(
  offset: number = 0,
  limit: number = 100
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> {
  "use cache"
  cacheTag("collections")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return sdk.store.collection
    .list({ limit, offset: 0 })
    .then(({ collections }) => ({ collections, count: collections.length }))
}

export async function getCollectionByHandle(
  handle: string
): Promise<HttpTypes.StoreCollection> {
  "use cache"
  cacheTag("collections", `collection-${handle}`)
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  return sdk.store.collection
    .list({ handle })
    .then(({ collections }) => collections[0])
}

export async function getCollectionsWithProducts(
  countryCode: string
): Promise<HttpTypes.StoreCollection[] | null> {
  const { collections } = await getCollectionsList(0, 3)

  if (!collections) {
    return null
  }

  const collectionIds = collections
    .map((collection) => collection.id)
    .filter(Boolean) as string[]

  const { response } = await getProductsList({
    // collection_id accepted at runtime; cast over SDK preview type drift.
    queryParams: { collection_id: collectionIds } as Parameters<
      typeof getProductsList
    >[0]["queryParams"],
    countryCode,
  })

  response.products.forEach((product) => {
    const collection = collections.find(
      (collection) => collection.id === product.collection_id
    )

    if (collection) {
      if (!collection.products) {
        collection.products = []
      }

      collection.products.push(product as any)
    }
  })

  return collections as unknown as HttpTypes.StoreCollection[]
}

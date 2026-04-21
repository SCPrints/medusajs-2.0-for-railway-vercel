import { HttpTypes } from "@medusajs/types"

export type DefaultGarment = { url: string; title: string } | null

/** Primary image for the customizer mockup when no variant-specific garment image applies. */
export function extractDefaultGarmentFromProduct(
  product: HttpTypes.StoreProduct
): DefaultGarment {
  const candidateImage = product?.images?.find((image) => typeof image?.url === "string")?.url

  if (candidateImage) {
    return {
      url: candidateImage,
      title: product?.title ?? "Product garment",
    }
  }

  if (typeof product?.thumbnail === "string" && product.thumbnail) {
    return {
      url: product.thumbnail,
      title: product?.title ?? "Product garment",
    }
  }

  return null
}

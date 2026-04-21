"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { useMemo } from "react"
import { useProductOptions } from "@modules/products/context/product-options-context"
import {
  findProductImageByUrl,
  getGarmentImageUrlsFromMetadata,
  normalizeImageUrl,
  resolveVariantFromOptions,
  urlMatchesColorLabelStrict,
} from "@modules/products/lib/variant-options"

type ImageGalleryProps = {
  product: HttpTypes.StoreProduct
  images: HttpTypes.StoreProductImage[]
  thumbnail?: string | null
}

const COLOR_OPTION_MATCHER = /(color|colour)/i

const ImageGallery = ({ product, images, thumbnail }: ImageGalleryProps) => {
  const { options } = useProductOptions()

  const galleryImages = useMemo(() => {
    const validImages = images
      .filter((image) => Boolean(image.url))
      .map((image) => ({
        id: image.id,
        url: image.url as string,
      }))

    const selectedColor = Object.entries(options).find(([title]) =>
      COLOR_OPTION_MATCHER.test(title)
    )?.[1]

    const selectedVariant = resolveVariantFromOptions(product, options)

    let mappedVariantImages = getGarmentImageUrlsFromMetadata(
      (selectedVariant as any)?.metadata as Record<string, unknown> | undefined
    )

    if (selectedColor && mappedVariantImages.length) {
      const narrowed = mappedVariantImages.filter((url) =>
        urlMatchesColorLabelStrict(url, selectedColor)
      )
      mappedVariantImages = narrowed
    }

    if (mappedVariantImages.length) {
      return mappedVariantImages.map((mappedUrl, index) => {
        const fromProduct = findProductImageByUrl(mappedUrl, validImages)
        if (fromProduct) {
          return fromProduct
        }
        return {
          id: `variant-metadata-${index}`,
          url: mappedUrl,
        }
      })
    }

    if (!selectedColor || validImages.length <= 1) {
      return validImages
    }

    const matched = validImages.filter((image) =>
      urlMatchesColorLabelStrict(image.url, selectedColor)
    )

    if (!matched.length) {
      return validImages
    }

    return matched
  }, [images, options, product.variants])

  const fallbackImages = useMemo(() => {
    if (galleryImages.length > 0) {
      return galleryImages
    }

    if (thumbnail) {
      return [{ id: "thumbnail-fallback", url: thumbnail }]
    }

    return []
  }, [galleryImages, thumbnail])

  const hasProductImages = fallbackImages.length > 0

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {!hasProductImages && (
          <Container className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle p-6 flex items-center justify-center">
            <p className="text-sm text-ui-fg-subtle text-center">
              No garment image is available for this product yet.
            </p>
          </Container>
        )}

        {fallbackImages.map((image, index) => (
          <Container
            key={`${image.id}-${index}-${normalizeImageUrl(image.url).slice(-48)}`}
            className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
            id={image.id}
          >
            <Image
              src={image.url}
              priority={index <= 2 ? true : false}
              className="absolute inset-0 rounded-rounded"
              alt={`Product image ${index + 1}`}
              fill
              sizes="(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"
              style={{
                objectFit: "cover",
              }}
            />
          </Container>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery

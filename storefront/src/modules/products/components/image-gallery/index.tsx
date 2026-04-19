"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import { isEqual } from "lodash"
import Image from "next/image"
import { useMemo } from "react"
import { useProductOptions } from "@modules/products/context/product-options-context"
import {
  findProductImageByUrl,
  getGarmentImageUrlsFromMetadata,
  normalizeImageUrl,
  optionsAsKeymap,
} from "@modules/products/lib/variant-options"

type ImageGalleryProps = {
  product: HttpTypes.StoreProduct
  images: HttpTypes.StoreProductImage[]
  thumbnail?: string | null
}

const COLOR_OPTION_MATCHER = /(color|colour)/i

const normalizeValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const buildColorNeedles = (colorValue: string) => {
  const normalized = normalizeValue(colorValue)

  if (!normalized) {
    return []
  }

  const words = normalized.split(" ").filter(Boolean)
  const compact = words.join("")
  const joinedWithDash = words.join("-")
  const joinedWithUnderscore = words.join("_")

  return Array.from(new Set([normalized, compact, joinedWithDash, joinedWithUnderscore, ...words]))
}

const ImageGallery = ({ product, images, thumbnail }: ImageGalleryProps) => {
  const { options } = useProductOptions()

  const galleryImages = useMemo(() => {
    const validImages = images
      .filter((image) => Boolean(image.url))
      .map((image) => ({
        id: image.id,
        url: image.url as string,
      }))

    const selectedEntries = Object.entries(options).filter(([, value]) => Boolean(value))

    const selectedVariant =
      selectedEntries.length === 0
        ? undefined
        : (() => {
            const variants = product.variants ?? []
            const exact = variants.find((variant) => {
              const vo = optionsAsKeymap((variant as any).options)
              return isEqual(vo, options)
            })
            if (exact) {
              return exact
            }
            return variants.find((variant) => {
              const variantOptions = optionsAsKeymap((variant as any).options)
              return selectedEntries.every(([title, value]) => value === variantOptions[title])
            })
          })()

    const mappedVariantImages = getGarmentImageUrlsFromMetadata(
      (selectedVariant as any)?.metadata as Record<string, unknown> | undefined
    )

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

    const selectedColor = Object.entries(options).find(([title]) =>
      COLOR_OPTION_MATCHER.test(title)
    )?.[1]

    if (!selectedColor || validImages.length <= 1) {
      return validImages
    }

    const needles = buildColorNeedles(selectedColor)
    if (!needles.length) {
      return validImages
    }

    const normalizedImages = validImages.map((image) => ({
      ...image,
      normalizedUrl: normalizeValue(image.url),
    }))

    const matched = normalizedImages.filter((image) =>
      needles.some((needle) => image.normalizedUrl.includes(needle))
    )

    if (!matched.length) {
      return validImages
    }

    return matched.map(({ normalizedUrl: _normalizedUrl, ...image }) => image)
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

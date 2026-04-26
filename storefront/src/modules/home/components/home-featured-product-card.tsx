"use client"

import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import { useCallback, useEffect, useState } from "react"

import PlaceholderImage from "@modules/common/icons/placeholder-image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductTags from "@modules/products/components/product-tags"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"

export type HomeFeaturedSwatch = {
  colorLabel: string
  imageUrl: string
}

type HomeFeaturedProductCardProps = {
  href: string
  title: string
  tagLabels: string[]
  fabricType: string
  fabricWeight: string
  priceLine: string
  defaultImageUrl: string | null
  swatches: HomeFeaturedSwatch[]
}

function CardImage({
  imageUrl,
  title,
}: {
  imageUrl: string | null
  title: string
}) {
  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden p-4 bg-ui-bg-subtle shadow-elevation-card-rest rounded-large group-hover:shadow-elevation-card-hover transition-shadow ease-in-out duration-150 aspect-[1/1] rounded-lg"
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={title}
          className="absolute inset-0 object-cover object-center"
          draggable={false}
          quality={50}
          sizes="(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"
          fill
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PlaceholderImage size={24} />
        </div>
      )}
    </Container>
  )
}

export default function HomeFeaturedProductCard({
  href,
  title,
  tagLabels,
  fabricType,
  fabricWeight,
  priceLine,
  defaultImageUrl,
  swatches,
}: HomeFeaturedProductCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultImageUrl)

  useEffect(() => {
    setPreviewUrl(defaultImageUrl)
  }, [defaultImageUrl])

  const resetPreview = useCallback(() => {
    setPreviewUrl(defaultImageUrl)
  }, [defaultImageUrl])

  return (
    <li className="w-[280px] shrink-0 snap-start rounded-xl border border-ui-border-base bg-white p-4 transition-colors hover:border-[var(--brand-secondary)]/55">
      <LocalizedClientLink href={href} className="group block">
        <CardImage imageUrl={previewUrl} title={title} />
        <h3 className="mt-4 text-base font-semibold text-ui-fg-base">{title}</h3>
        <ProductTags labels={tagLabels} className="mt-2" />
        <div className="mt-3 space-y-1 text-sm text-ui-fg-subtle">
          <p>
            <span className="font-medium text-ui-fg-base">Fabric:</span> {fabricType}
          </p>
          <p>
            <span className="font-medium text-ui-fg-base">Weight:</span> {fabricWeight}
          </p>
          <p>
            <span className="font-medium text-ui-fg-base">Price:</span> {priceLine}
          </p>
        </div>
      </LocalizedClientLink>

      <div
        className="mt-4"
        onMouseLeave={resetPreview}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            resetPreview()
          }
        }}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-muted">
          Available colors
        </p>
        <div className="flex flex-wrap gap-2">
          {swatches.length ? (
            swatches.map(({ colorLabel, imageUrl }) => (
              <button
                key={`${href}-${colorLabel}`}
                type="button"
                title={colorLabel}
                aria-label={`Preview ${title} in ${colorLabel}`}
                className="inline-block h-5 w-5 rounded-full border border-ui-border-base transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-fg-base focus-visible:ring-offset-2"
                style={{
                  backgroundColor: resolveGarmentSwatchColor(colorLabel),
                }}
                onMouseEnter={() => setPreviewUrl(imageUrl)}
                onFocus={() => setPreviewUrl(imageUrl)}
              />
            ))
          ) : (
            <span className="text-xs text-ui-fg-muted">Color options on product page</span>
          )}
        </div>
      </div>
    </li>
  )
}

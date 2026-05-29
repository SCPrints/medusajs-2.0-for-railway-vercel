import Image from "next/image"

import SectionHeader from "@modules/common/components/section-header"
import type { BrandGalleryImage } from "@modules/brands/data/brands"

type Props = {
  brandName: string
  images: BrandGalleryImage[]
}

/**
 * Product gallery for a brand landing page — stock/lifestyle shots of blanks
 * in the catalogue. Rendered only when the brand has gallery images configured
 * in `@modules/brands/data/brands` (the caller guards on a non-empty array).
 */
export default function BrandGallery({ brandName, images }: Props) {
  if (!images.length) return null

  return (
    <section className="content-container border-t border-ui-border-base py-12 small:py-16">
      <SectionHeader
        eyebrow="The range"
        title={`Stock ${brandName} we print on`}
      />
      <ul className="grid grid-cols-2 gap-3 small:grid-cols-3 small:gap-4">
        {images.map((image, index) => (
          <li
            key={image.src}
            className="group relative aspect-square overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 1024px) 50vw, 33vw"
              quality={50}
              loading={index < 3 ? "eager" : "lazy"}
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

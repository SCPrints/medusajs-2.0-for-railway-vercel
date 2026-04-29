import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import React from "react"

import PlaceholderImage from "@modules/common/icons/placeholder-image"

import { remapStaleExternalGarmentUrl } from "@lib/util/remap-stale-supplier-images"

type ThumbnailProps = {
  thumbnail?: string | null
  // TODO: Fix image typings
  images?: any[] | null
  size?: "small" | "medium" | "large" | "full" | "square"
  isFeatured?: boolean
  /** Passed to `next/image` `sizes` — use a tight value for catalog grids to shrink srcset. */
  sizes?: string
  className?: string
  "data-testid"?: string
}

/** Tight viewport-relative sizes for catalog grids (avoids oversized `/_next/image` srcset widths). */
const DEFAULT_SIZES =
  "(max-width: 576px) 50vw, (max-width: 992px) 33vw, 260px"

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured,
  sizes,
  className,
  "data-testid": dataTestid,
}) => {
  const rawThumbnail = thumbnail || images?.[0]?.url
  const initialImage = rawThumbnail
    ? remapStaleExternalGarmentUrl(rawThumbnail) ?? rawThumbnail
    : undefined

  return (
    <Container
      className={clx(
        "relative w-full overflow-hidden p-4 bg-ui-bg-subtle shadow-elevation-card-rest rounded-large group-hover:shadow-elevation-card-hover transition-shadow ease-in-out duration-150",
        className,
        {
          "aspect-[11/14]": isFeatured,
          "aspect-[9/16]": !isFeatured && size !== "square",
          "aspect-[1/1]": size === "square",
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
          "w-full": size === "full",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder
        image={initialImage}
        size={size}
        sizes={sizes ?? DEFAULT_SIZES}
      />
    </Container>
  )
}

const ImageOrPlaceholder = ({
  image,
  size,
  sizes,
}: Pick<ThumbnailProps, "size"> & { image?: string; sizes: string }) => {
  return image ? (
    <Image
      src={image}
      alt="Thumbnail"
      className="absolute inset-0 object-cover object-center"
      draggable={false}
      quality={50}
      sizes={sizes}
      fill
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center">
      <PlaceholderImage size={size === "small" ? 16 : 24} />
    </div>
  )
}

export default Thumbnail

"use client"

import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

import PlaceholderImage from "@modules/common/icons/placeholder-image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import type { ProductListingCardData } from "@modules/products/lib/product-listing-card-data"

type ProductListingCardProps = ProductListingCardData & {
  className?: string
}

/** Kept in sync with `duration-300` on the card hover transform. */
const CARD_HOVER_EXPAND_MS = 300
const ENTER_WOBBLE_DELAY_MS = CARD_HOVER_EXPAND_MS + 16

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
          className="absolute inset-0 object-cover object-center transition-transform duration-300 ease-out will-change-transform group-hover:scale-110"
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

export default function ProductListingCard({
  className,
  href,
  title,
  priceFromLine,
  priceHundredPlusLine,
  defaultImageUrl,
  swatches,
  totalSwatchCount,
}: ProductListingCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultImageUrl)
  const [wobble, setWobble] = useState<"in" | "out" | null>(null)
  const pointerInsideRef = useRef(false)
  const enterWobbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveWobbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPreviewUrl(defaultImageUrl)
  }, [defaultImageUrl])

  useEffect(() => {
    return () => {
      if (enterWobbleTimeoutRef.current) {
        clearTimeout(enterWobbleTimeoutRef.current)
      }
      if (leaveWobbleTimeoutRef.current) {
        clearTimeout(leaveWobbleTimeoutRef.current)
      }
    }
  }, [])

  const resetPreview = useCallback(() => {
    setPreviewUrl(defaultImageUrl)
  }, [defaultImageUrl])

  const clearLeaveWobbleTimeout = useCallback(() => {
    if (leaveWobbleTimeoutRef.current) {
      clearTimeout(leaveWobbleTimeoutRef.current)
      leaveWobbleTimeoutRef.current = null
    }
  }, [])

  const clearEnterWobbleTimeout = useCallback(() => {
    if (enterWobbleTimeoutRef.current) {
      clearTimeout(enterWobbleTimeoutRef.current)
      enterWobbleTimeoutRef.current = null
    }
  }, [])

  const shouldPlayWobble = useCallback(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )

  return (
    <article
      data-testid="product-wrapper"
      onMouseEnter={() => {
        pointerInsideRef.current = true
        clearLeaveWobbleTimeout()
        setWobble(null)
        if (!shouldPlayWobble()) return
        clearEnterWobbleTimeout()
        enterWobbleTimeoutRef.current = setTimeout(() => {
          enterWobbleTimeoutRef.current = null
          if (!pointerInsideRef.current) return
          setWobble("in")
        }, ENTER_WOBBLE_DELAY_MS)
      }}
      onMouseLeave={() => {
        pointerInsideRef.current = false
        clearEnterWobbleTimeout()
        setWobble(null)
        resetPreview()
        if (!shouldPlayWobble()) return
        clearLeaveWobbleTimeout()
        leaveWobbleTimeoutRef.current = setTimeout(() => {
          leaveWobbleTimeoutRef.current = null
          setWobble("out")
        }, 220)
      }}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return
        const name = e.animationName.toLowerCase()
        if (name.includes("card-listing-wobble")) {
          setWobble(null)
        }
      }}
      className={clx(
        "flex h-full w-full flex-col rounded-xl border border-ui-border-base bg-white p-4",
        "relative z-0 transform-gpu transition-[transform,box-shadow,border-color] duration-300 ease-out",
        "hover:border-[var(--brand-secondary)]/70 hover:shadow-elevation-card-hover",
        "hover:z-10",
        /* +4% vs resting size: scale(1.04) on each axis. z-10 paints above siblings so the grow does not “hide” under neighbours */
        "motion-safe:hover:-translate-y-2.5 motion-safe:hover:scale-[1.04]",
        "group",
        wobble === "in" && "motion-safe:animate-card-listing-wobble-in",
        wobble === "out" && "motion-safe:animate-card-listing-wobble-out",
        className
      )}
    >
      <LocalizedClientLink href={href} className="block min-w-0">
        <CardImage imageUrl={previewUrl} title={title} />
        <h3
          className="mt-4 text-base font-semibold text-ui-fg-base"
          data-testid="product-title"
        >
          {title}
        </h3>
        <div className="mt-2 text-sm text-ui-fg-subtle">
          <p>{priceFromLine}</p>
          {priceHundredPlusLine ? (
            <p className="mt-0.5 text-xs text-ui-fg-muted">{priceHundredPlusLine}</p>
          ) : null}
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
        <div className="flex flex-wrap items-center gap-2">
          {swatches.length ? (
            <>
              {swatches.map(({ colorLabel, imageUrl, swatchPhotoUrl }) => (
                <button
                  key={`${href}-${colorLabel}`}
                  type="button"
                  title={colorLabel}
                  aria-label={`Preview ${title} in ${colorLabel}`}
                  className="inline-block h-5 w-5 rounded-full border border-ui-border-base transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-fg-base focus-visible:ring-offset-2"
                  style={{
                    backgroundColor: resolveGarmentSwatchColor(colorLabel),
                    ...(swatchPhotoUrl
                      ? {
                          backgroundImage: `url("${swatchPhotoUrl}")`,
                          backgroundSize: "235%",
                          backgroundPosition: "center 35%",
                        }
                      : {}),
                  }}
                  onMouseEnter={() => setPreviewUrl(imageUrl)}
                  onFocus={() => setPreviewUrl(imageUrl)}
                />
              ))}
              {totalSwatchCount > swatches.length ? (
                <span
                  className="inline-flex h-5 min-w-[1.25rem] max-w-[2rem] shrink-0 items-center justify-center rounded-full border border-ui-border-base bg-ui-bg-subtle px-1 text-[10px] font-semibold tabular-nums leading-none text-ui-fg-subtle"
                  title={`${totalSwatchCount} colors total — see all on the product page`}
                  aria-label={`${totalSwatchCount} total colors. Fewer swatches are shown; open the product page for the full list.`}
                >
                  {totalSwatchCount}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-ui-fg-muted">
              Color options on product page
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

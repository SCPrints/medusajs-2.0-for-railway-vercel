"use client"

import type { HowOrderSvgAnimationVariant } from "@modules/home/lib/how-order-custom-icons"
import { themedSvgMarkup } from "@modules/home/lib/themed-svg-markup"
import { useMemo } from "react"

const VARIANT_CLASS: Record<HowOrderSvgAnimationVariant, string> = {
  pulse: "how-order-icon-animate--pulse",
  rotate: "how-order-icon-animate--rotate",
  bob: "how-order-icon-animate--bob",
  "pulse-soft": "how-order-icon-animate--pulse-soft",
  slide: "how-order-icon-animate--slide",
  float: "how-order-icon-animate--float",
}

type Props = {
  svgContent: string
  variant: HowOrderSvgAnimationVariant
  /** Max bounding box side in px (how-order circles use 56; services tiles use 44). */
  maxSizePx?: number
  className?: string
}

/** Inline SVG from home manifest JSON with CSS motion (see globals.css). */
export default function HowOrderSvgIcon({
  svgContent,
  variant,
  maxSizePx = 56,
  className = "",
}: Props) {
  const html = useMemo(() => themedSvgMarkup(svgContent), [svgContent])
  const sizeClass =
    maxSizePx === 44
      ? "max-h-[44px] max-w-[44px]"
      : "max-h-[56px] max-w-[56px]"

  return (
    <span
      className={`inline-flex h-full w-full ${sizeClass} items-center justify-center [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:overflow-visible ${VARIANT_CLASS[variant]} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-hidden
    />
  )
}

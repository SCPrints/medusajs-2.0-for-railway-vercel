"use client"

import Image, { type ImageProps } from "next/image"
import React from "react"

/**
 * `next/image` THROWS synchronously during render when the `src` hostname isn't
 * configured in `next.config.js` `images.remotePatterns`. A single polluted or
 * legacy image URL — a supplier rotating its CDN path, an order/cart line that
 * carries an un-allow-listed host — would otherwise bubble up to the nearest
 * React error boundary and take down the whole surface (the cart dropdown, the
 * studio top bar, an order detail page). This boundary contains the blast radius
 * to the one image: on a render throw it swaps to a plain `<img>`, which has no
 * host allow-list and therefore cannot throw.
 */
class NextImageErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state: { failed: boolean } = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    // Swallow: the fallback <img> already preserves the UX, and the underlying
    // next/image "hostname not configured" error would otherwise spam logs on
    // every render of a stale image.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export { NextImageErrorBoundary }

/**
 * Drop-in replacement for `next/image` that never crashes the page on an
 * unconfigured-host `src`. Optimized via `next/image` on the happy path (props
 * are forwarded verbatim, so there is no behaviour change for allow-listed
 * hosts); only when `next/image` throws does it fall back to a plain, unoptimized
 * `<img>` so the surrounding UI keeps working.
 */
export default function SafeImage(props: ImageProps) {
  const { src, alt, className, fill, draggable, style, width, height } = props
  const fallbackSrc = typeof src === "string" ? src : undefined

  return (
    <NextImageErrorBoundary
      fallback={
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackSrc}
          alt={typeof alt === "string" ? alt : ""}
          className={className}
          draggable={draggable}
          width={!fill && typeof width === "number" ? width : undefined}
          height={!fill && typeof height === "number" ? height : undefined}
          // `fill` images are positioned by next/image's injected absolute-fill
          // styles; replicate them so the fallback occupies the same box even if
          // the caller didn't also express it via className. Caller `style` wins.
          style={
            fill
              ? {
                  position: "absolute",
                  inset: 0,
                  height: "100%",
                  width: "100%",
                  objectFit: "cover",
                  ...style,
                }
              : style
          }
        />
      }
    >
      <Image {...props} />
    </NextImageErrorBoundary>
  )
}

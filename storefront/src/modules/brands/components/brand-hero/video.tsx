"use client"

import { useMediaQuery } from "@lib/hooks/use-media-query"

type Props = {
  src: string
  poster?: string | null
}

/**
 * Autoplaying, muted, looping background video for the brand hero — a small
 * client island so the parent <BrandHero> can stay a server component.
 *
 * Honours `prefers-reduced-motion`: those visitors get the static poster
 * frame instead of the moving video. `useMediaQuery` returns false on SSR /
 * first render (its documented "safe default"), so the video renders for the
 * majority and a reduced-motion visitor sees at most a brief frame before it
 * swaps to the still.
 *
 * `aria-hidden` because it's purely decorative — the brand name + logo carry
 * the meaning.
 */
export default function BrandHeroVideo({ src, poster }: Props) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")

  if (reduceMotion) {
    if (!poster) return null
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={poster}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    )
  }

  return (
    <video
      className="absolute inset-0 h-full w-full object-cover object-center"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster ?? undefined}
      aria-hidden
    >
      <source src={src} type="video/mp4" />
    </video>
  )
}

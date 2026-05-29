import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import BrandHeroVideo from "./video"

type ChildBrand = {
  id: string
  name: string
  handle: string
}

type Props = {
  name: string
  description?: string | null
  logoSrc?: string | null
  bannerSrc?: string | null
  /**
   * Optional autoplaying background video (muted/looping). Takes precedence
   * over `bannerSrc`. `videoPosterSrc` is the still shown while it loads and
   * to `prefers-reduced-motion` visitors.
   */
  videoSrc?: string | null
  videoPosterSrc?: string | null
  /** Tailwind background class used for the gradient fallback when no banner exists. */
  bgClass: string
  childBrands?: ChildBrand[]
}

/**
 * Full-width hero for the `/brands/<handle>` landing page. Uses the brand's wide
 * banner image when one is configured; otherwise falls back to a branded gradient
 * built from the presentation `bgClass`. The brand logo sits on a light chip so
 * dark wordmarks stay legible over the photo overlay.
 */
export default function BrandHero({
  name,
  description,
  logoSrc,
  bannerSrc,
  videoSrc,
  videoPosterSrc,
  bgClass,
  childBrands = [],
}: Props) {
  return (
    <section className="relative w-full overflow-hidden bg-zinc-900">
      <div className="absolute inset-0">
        {videoSrc ? (
          <BrandHeroVideo src={videoSrc} poster={videoPosterSrc} />
        ) : bannerSrc ? (
          <Image
            src={bannerSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        ) : (
          <div className={`h-full w-full ${bgClass}`} aria-hidden />
        )}
        {/* Legibility overlay — darker at the bottom where the text sits. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
      </div>

      <div className="content-container relative flex min-h-[44vh] flex-col justify-end py-12 small:min-h-[48vh] small:py-16">
        {logoSrc ? (
          <span className="mb-5 inline-flex w-fit items-center rounded-xl bg-white/95 px-4 py-3 shadow-sm ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={`${name} logo`}
              className="h-9 w-auto max-w-[180px] object-contain small:h-11"
              loading="eager"
              decoding="async"
            />
          </span>
        ) : null}

        <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm small:text-4xl medium:text-5xl">
          {name}
        </h1>

        {description ? (
          <p className="mt-3 max-w-2xl text-sm text-white/85 small:text-base">
            {description}
          </p>
        ) : null}

        {childBrands.length > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {childBrands.map((c) => (
              <li key={c.id}>
                <LocalizedClientLink
                  href={`/brands/${c.handle}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/30 bg-white/10 px-4 py-1 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  {c.name}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

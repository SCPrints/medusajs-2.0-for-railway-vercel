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
  /**
   * "light" renders a split layout: logo + text on the left, product photo on
   * the right, over the `bgClass` background. Text is dark. The product image
   * uses mix-blend-multiply so a white background disappears into the brand colour.
   */
  heroVariant?: "light" | null
  /** Product/lifestyle photo for the right-hand side of the light variant. */
  heroProductSrc?: string | null
}

function LogoChip({
  logoSrc,
  name,
  dark = false,
}: {
  logoSrc: string
  name: string
  dark?: boolean
}) {
  return (
    <span
      className={`mb-5 inline-flex w-fit items-center rounded-xl px-4 py-3 shadow-sm ring-1 ${
        dark
          ? "bg-stone-900/10 ring-black/10"
          : "bg-white/95 ring-black/5"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={`${name} logo`}
        className="h-9 w-auto max-w-[180px] object-contain small:h-11"
        loading="eager"
        decoding="async"
      />
    </span>
  )
}

/**
 * Full-width hero for the `/brands/<handle>` landing page.
 *
 * Dark variant (default): full-bleed image/video/gradient with white text and a
 * dark overlay. Uses `bannerSrc` → `videoSrc` → `bgClass` gradient in priority order.
 *
 * Light variant: split layout — text on the left, product photo on the right —
 * over the brand's `bgClass` background colour. Text is dark. Product image uses
 * mix-blend-multiply so a white photo background blends away cleanly.
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
  heroVariant,
  heroProductSrc,
}: Props) {
  if (heroVariant === "light") {
    return (
      <section className={`relative w-full overflow-hidden ${bgClass}`}>
        <div className="content-container relative flex min-h-[44vh] flex-col items-center py-12 small:flex-row small:min-h-[52vh] small:py-16 medium:min-h-[56vh]">
          {/* Left: logo + title + description + child brand links */}
          <div className="flex flex-col justify-center small:w-1/2 small:pr-12 medium:pr-16">
            {logoSrc ? (
              <LogoChip logoSrc={logoSrc} name={name} dark />
            ) : null}

            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 small:text-4xl medium:text-5xl">
              {name}
            </h1>

            {description ? (
              <p className="mt-3 max-w-xl text-sm text-gray-600 small:text-base">
                {description}
              </p>
            ) : null}

            {childBrands.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-2">
                {childBrands.map((c) => (
                  <li key={c.id}>
                    <LocalizedClientLink
                      href={`/brands/${c.handle}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-gray-300 bg-white/60 px-4 py-1 text-sm font-medium text-gray-700 backdrop-blur-sm transition hover:bg-white/90"
                    >
                      {c.name}
                    </LocalizedClientLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Right: product photo */}
          {heroProductSrc ? (
            <div className="mt-10 flex w-full items-center justify-center small:mt-0 small:w-1/2">
              {/* mix-blend-multiply makes white photo backgrounds disappear into the stone bg */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroProductSrc}
                alt={`${name} hoodies`}
                className="max-h-72 w-auto object-contain mix-blend-multiply drop-shadow-lg small:max-h-[380px] medium:max-h-[440px]"
                loading="eager"
                decoding="async"
              />
            </div>
          ) : null}
        </div>
      </section>
    )
  }

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
          <LogoChip logoSrc={logoSrc} name={name} />
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

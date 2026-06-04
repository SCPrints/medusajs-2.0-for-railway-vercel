import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import DigitalRainHero from "@modules/home/components/digital-rain-hero"
import HeroOverlay from "@modules/home/components/space-hero/hero-overlay"


export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/digital-rain-hero`
  const description =
    "The neon digital-rain home page hero — preserved for reference after the Newmix v3 particle wordmark was adopted."

  return {
    title: "Digital rain hero",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Digital rain hero | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function DigitalRainHeroPage() {
  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed left-0 top-0 z-[40] w-full px-4 py-4 sm:px-6">
        <div className="pointer-events-auto inline-flex">
          <LocalizedClientLink
            href="/"
            className="txt-small text-white/80 transition-colors hover:text-white"
          >
            ← Back to home
          </LocalizedClientLink>
        </div>
      </div>
      {/* Faithful copy of the previous home hero: neon digital-rain canvas with
          the marketing overlay (headline + pricing hook + CTAs) on top. */}
      <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#0B0C10]">
        <DigitalRainHero style={{ position: "absolute", inset: 0, height: "100%" }} />
        <HeroOverlay />
      </section>
    </div>
  )
}

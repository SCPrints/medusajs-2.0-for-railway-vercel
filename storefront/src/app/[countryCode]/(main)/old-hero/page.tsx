import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import { NEWMIX_V3_TUNING } from "@modules/home/components/home-particle-logo-hero/newmix-v3-preset"
import { WORDMARK_GRADIENT } from "@modules/common/lib/wordmark-gradient"


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
  const canonicalPath = `/${countryCode}/old-hero`
  const description =
    "The original SC Prints home page hero — an interactive particle physics wordmark that reacts to cursor movement."

  return {
    title: "Old home page animation",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Old home page animation | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function OldHeroPage() {
  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed left-0 top-0 z-40 w-full px-4 py-4 sm:px-6">
        <div className="pointer-events-auto inline-flex">
          <LocalizedClientLink
            href="/"
            className="txt-small text-white/80 transition-colors hover:text-white"
          >
            ← Back to home
          </LocalizedClientLink>
        </div>
      </div>
      <HomeParticleLogoHero
        interactionMode="newmix"
        animatedParticleCap={55000}
        newmixLiveTuning={NEWMIX_V3_TUNING}
        bgClassName="bg-ui-fg-base"
        wordmarkGradient={WORDMARK_GRADIENT}
      />
    </div>
  )
}

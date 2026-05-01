import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import { ParticleLogoViscousTuningSection } from "./particle-logo-viscous-tuning-section"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/particle-logo`
  const description =
    "Particle logo lab: fluid wake vs viscous coffee (path memory, shear, slow fill-in)."

  return {
    title: "Interactive particle logo",
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Interactive particle logo | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function ParticleLogoPage() {
  return (
    <div className="relative min-h-screen bg-ui-fg-base text-white">
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
      <div className="pt-14">
        <p className="border-b border-white/15 px-4 py-3 text-center text-sm text-white/70 sm:px-6">
          Fluid wake (path memory)
        </p>
        <HomeParticleLogoHero
          presentation="embedded"
          interactionMode="fluidWake"
          sectionAriaLabel="SC Prints — fluid wake particle logo"
        />
        <ParticleLogoViscousTuningSection />
      </div>
    </div>
  )
}

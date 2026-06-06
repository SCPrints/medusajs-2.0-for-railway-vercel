import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import EmbroideryStitchHero from "@modules/home/components/embroidery-stitch-hero"


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
  const canonicalPath = `/${countryCode}/embroidery-hero`
  const description =
    "A hero animation that stitches the SC Prints wordmark in satin thread on hooped fabric — machine embroidery, satin stitch by satin stitch."

  return {
    title: "Embroidery stitch hero",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Embroidery stitch hero | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function EmbroideryHeroPage() {
  return (
    <div className="relative min-h-screen bg-[#15152a] text-white">
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
      {/* Machine-embroidery hero: the SC Prints wordmark stitched in satin thread
          on hooped fabric. Sheen follows the cursor; loops with a snip + restitch. */}
      <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#20203a]">
        <EmbroideryStitchHero style={{ position: "absolute", inset: 0, height: "100%" }} />
      </section>
    </div>
  )
}

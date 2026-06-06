import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ScreenprintCmykHero from "@modules/home/components/screenprint-cmyk-hero"

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
  const canonicalPath = `/${countryCode}/screenprint-hero`
  const description =
    "A Canvas 2D hero that registers the SC PRINTS wordmark as a CMYK screen-print — four halftone separations laid down and eased into a full-colour rosette."

  return {
    title: "CMYK screen-print hero",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `CMYK screen-print hero | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function ScreenprintHeroPage() {
  return (
    // Paper-white animation, so the wrapper + back link go dark-on-light to
    // contrast the off-white press stock the canvas paints.
    <div className="relative min-h-screen bg-[#fbfbf8] text-[#1a1a2e]">
      <div className="pointer-events-none fixed left-0 top-0 z-[40] w-full px-4 py-4 sm:px-6">
        <div className="pointer-events-auto inline-flex">
          <LocalizedClientLink
            href="/"
            className="txt-small text-[#1a1a2e]/70 transition-colors hover:text-[#1a1a2e]"
          >
            ← Back to home
          </LocalizedClientLink>
        </div>
      </div>
      {/* CMYK screen-print registration: the SC PRINTS mark builds up from four
          halftone colour separations on press stock, then resolves to a clean
          solid fill before looping. */}
      <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#fbfbf8]">
        <ScreenprintCmykHero style={{ position: "absolute", inset: 0, height: "100%" }} />
      </section>
    </div>
  )
}

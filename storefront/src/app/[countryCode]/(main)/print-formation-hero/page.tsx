import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PrintFormationHero from "@modules/home/components/print-formation-hero"


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
  const canonicalPath = `/${countryCode}/print-formation-hero`
  const description =
    "A Canvas 2D hero sandbox: loose ink particles converge into the SC PRINTS wordmark, a heat-press bar sweeps across and sets the DTF transfer crisp on a blank tee."

  return {
    title: "Ink to garment hero",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Ink to garment hero | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function PrintFormationHeroPage() {
  return (
    <div className="relative min-h-screen bg-[#dee1e8] text-[#1a1a2e]">
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
      {/* "Ink to garment" — a DTF / heat-transfer print forming on a blank tee.
          Loose ink particles converge into the SC PRINTS wordmark, then a
          heat-press bar sweeps across and sets the transfer crisp. */}
      <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden">
        <PrintFormationHero style={{ position: "absolute", inset: 0, height: "100%" }} />
      </section>
    </div>
  )
}

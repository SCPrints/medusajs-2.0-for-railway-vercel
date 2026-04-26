import { Metadata } from "next"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import ButtonAnimationsDemo from "@modules/test/components/button-animations-demo"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/test/button-animations`
  const description =
    "Internal page to preview add-to-cart micro-interactions (incl. fly-to-cart, morph, confetti, 3D flip, slot text, progress fill, shimmer, earcon, and more)."

  return {
    title: "Button animation tests",
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Button animation tests | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

export default function ButtonAnimationsTestPage() {
  return (
    <>
      <div className="bg-ui-bg-subtle border-b border-ui-border-base">
        <div className="content-container py-8 small:py-10">
          <h1 className="text-2xl small:text-3xl font-bold text-ui-fg-base">
            Add-to-cart interaction tests
          </h1>
          <p className="mt-2 max-w-2xl text-ui-fg-muted text-sm small:text-base">
            Twelve interaction patterns (including a fly + squish combo). Open this
            route with a country prefix, e.g.{" "}
            <code className="text-ui-fg-base">/au/test/button-animations</code>.
          </p>
        </div>
      </div>
      <ButtonAnimationsDemo />
    </>
  )
}

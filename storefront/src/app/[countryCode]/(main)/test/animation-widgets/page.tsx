import { Metadata } from "next"
import { Suspense } from "react"

import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import AnimationWidgetsDemo from "@modules/test/components/animation-widgets-demo"

type MetadataProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}/test/animation-widgets`
  const description =
    "Internal lab page for motion and UI experiments (10 sections per page): embeds, particles, reveals, sheets, micro-interactions, and add-to-cart / button interaction tests (fly-to-cart, Tetris, bubble pop, etc.). Use ?page=2, ?page=3, etc."

  return {
    title: "Animation widgets lab",
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `Animation widgets lab | ${SEO.siteName}`,
      description,
      images: [SEO.ogImage],
    },
  }
}

function AnimationWidgetsDemoFallback() {
  return (
    <div className="content-container py-12">
      <div className="space-y-10">
        {[1, 2, 3].map((k) => (
          <div key={k} className="animate-pulse space-y-4 border-b border-ui-border-base pb-12">
            <div className="h-7 w-56 rounded bg-ui-bg-subtle" />
            <div className="h-4 w-full max-w-2xl rounded bg-ui-bg-subtle" />
            <div className="h-48 rounded-xl bg-ui-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnimationWidgetsTestPage() {
  return (
    <>
      <div className="bg-ui-bg-subtle border-b border-ui-border-base">
        <div className="content-container py-8 small:py-10">
          <h1 className="text-2xl small:text-3xl font-bold text-ui-fg-base">
            Animation widgets lab
          </h1>
          <p className="mt-2 max-w-2xl text-ui-fg-muted text-sm small:text-base">
            Unlisted test route for motion, embed, and add-to-cart interaction experiments. Open with a country
            prefix, e.g. <code className="text-ui-fg-base">/au/test/animation-widgets</code>. Sections are paginated (
            <code className="text-ui-fg-base">?page=2</code>, 10 per page); add-to-cart / button interaction blocks
            start around page 6 (see footer pagination). The old{" "}
            <code className="text-ui-fg-base">/test/button-animations</code> URL redirects to that page. Global cursor
            trail is disabled so the custom cursor demo is visible.
          </p>
        </div>
      </div>
      <Suspense fallback={<AnimationWidgetsDemoFallback />}>
        <AnimationWidgetsDemo />
      </Suspense>
    </>
  )
}

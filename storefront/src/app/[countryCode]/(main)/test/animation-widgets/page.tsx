import { Metadata } from "next"

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
    "Internal lab page for animation widgets: Lordicon, Lottie, blobs, custom cursor, countdown, before/after slider, loader overlay, embed placeholder, typewriter, particles, snow, and confetti bursts."

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

export default function AnimationWidgetsTestPage() {
  return (
    <>
      <div className="bg-ui-bg-subtle border-b border-ui-border-base">
        <div className="content-container py-8 small:py-10">
          <h1 className="text-2xl small:text-3xl font-bold text-ui-fg-base">
            Animation widgets lab
          </h1>
          <p className="mt-2 max-w-2xl text-ui-fg-muted text-sm small:text-base">
            Unlisted test route for motion and embed experiments. Open with a country prefix, e.g.{" "}
            <code className="text-ui-fg-base">/au/test/animation-widgets</code>. Global cursor trail is
            disabled here so the custom cursor demo is visible.
          </p>
        </div>
      </div>
      <AnimationWidgetsDemo />
    </>
  )
}

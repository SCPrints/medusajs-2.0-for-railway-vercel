import { redirect } from "next/navigation"
import type { Metadata } from "next"

type Params = { countryCode: string }

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "PDP layout preview | SC PRINTS",
    robots: { index: false, follow: false },
  }
}

/**
 * Bare /pdp-preview redirects to the "current" variant so the switcher
 * pill renders against a real layout instead of a 404.
 */
export default async function PdpPreviewIndex({
  params,
}: {
  params: Promise<Params>
}) {
  const { countryCode } = await params
  redirect(`/${countryCode}/pdp-preview/current`)
}

import { Metadata } from "next"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import FluidWordmark from "@modules/home/components/fluid-wordmark"

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

export const metadata: Metadata = {
  title: "Particle fluid",
  description: "SC Prints wordmark as a stirrable particle fluid.",
  // Dev/experiment sandbox — keep out of the index like the sibling labs.
  robots: { index: false, follow: false },
}

export default function ParticleFluidPage() {
  return (
    <div className="relative h-[85vh] min-h-[480px] bg-[#111] text-white">
      <div className="pointer-events-none absolute left-0 top-0 z-10 px-4 py-4 sm:px-6">
        <LocalizedClientLink
          href="/sandbox"
          className="pointer-events-auto txt-small !text-white/80 transition-colors hover:!text-white"
        >
          ← Back to sandbox
        </LocalizedClientLink>
      </div>
      <FluidWordmark />
    </div>
  )
}

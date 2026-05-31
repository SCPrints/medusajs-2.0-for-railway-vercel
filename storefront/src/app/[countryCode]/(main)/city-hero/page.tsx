import { Metadata } from "next"

import HeroOverlay from "@modules/home/components/space-hero/hero-overlay"
import CityHeroClient from "./city-hero-client"

/**
 * Preview route for the block-city hero candidate (variant 3): extruded rounded
 * blocks with visible walls, seen from above, bobbing toward the viewer — with
 * the SC Prints wordmark laid crisply over the top. A/B against /au (digital
 * rain), /au/block-hero (flat block grid) and /au/space-hero. Noindex,nofollow.
 */
export const metadata: Metadata = {
  title: "Block city hero (preview)",
  robots: { index: false, follow: false },
}

export default function CityHeroPreviewPage() {
  return (
    <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#0c0b1a]">
      <CityHeroClient />

      {/* Wordmark composited over the top (white via filter, soft glow for
          legibility over the busy field). Upper-centre so it doesn't fight the
          HeroOverlay headline/CTAs below. */}
      <div className="pointer-events-none absolute inset-x-0 top-[10%] z-20 flex justify-center px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/sc-prints-logo-transparent.png"
          alt="SC Prints"
          className="h-auto w-[44vw] max-w-[340px] tablet:max-w-[400px]"
          style={{
            filter:
              "brightness(0) invert(1) drop-shadow(0 4px 22px rgba(0,0,0,0.55))",
          }}
        />
      </div>

      <HeroOverlay />
    </section>
  )
}

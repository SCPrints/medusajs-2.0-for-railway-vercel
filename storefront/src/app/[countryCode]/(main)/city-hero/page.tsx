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
      {/* The wordmark is now voxelised INTO the scene (raised glowing blocks at
          the centre), not composited on top — see block-city-hero. */}
      <CityHeroClient />
      <HeroOverlay />
    </section>
  )
}

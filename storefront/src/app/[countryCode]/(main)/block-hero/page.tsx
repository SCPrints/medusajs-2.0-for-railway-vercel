import { Metadata } from "next"

import HeroOverlay from "@modules/home/components/space-hero/hero-overlay"
import BlockHeroClient from "./block-hero-client"

/**
 * Preview route for the block-grid hero candidate (perspective grid of bobbing
 * pastel blocks + voxelised logo at the centre). Lets us A/B it against the
 * live digital-rain home hero and the archived /space-hero before deciding what
 * ships on the home page. Not linked from nav; noindex,nofollow.
 */
export const metadata: Metadata = {
  title: "Block grid hero (preview)",
  robots: { index: false, follow: false },
}

export default function BlockHeroPreviewPage() {
  return (
    <section className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-[#0c0b1a]">
      <BlockHeroClient />
      <HeroOverlay />
    </section>
  )
}

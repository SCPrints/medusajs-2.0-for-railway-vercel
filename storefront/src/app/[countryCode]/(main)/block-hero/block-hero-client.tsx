"use client"

import dynamic from "next/dynamic"

/** The Three.js scene touches WebGL/window at import, so it must be client-only.
 * Next 15 requires ssr:false to live inside a Client Component (not the server
 * page.tsx). Mirrors the particle-three-client pattern. */
const BlockGridHero = dynamic(
  () => import("@modules/home/components/block-grid-hero"),
  { ssr: false }
)

export default function BlockHeroClient() {
  return <BlockGridHero style={{ position: "absolute", inset: 0, height: "100%" }} />
}

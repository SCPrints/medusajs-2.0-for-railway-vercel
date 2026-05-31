"use client"

import dynamic from "next/dynamic"

/** Three.js scene → client-only (WebGL/window at import); Next 15 needs ssr:false
 * inside a Client Component. Mirrors the other hero preview wrappers. */
const BlockCityHero = dynamic(
  () => import("@modules/home/components/block-city-hero"),
  { ssr: false }
)

export default function CityHeroClient() {
  return <BlockCityHero style={{ position: "absolute", inset: 0, height: "100%" }} />
}

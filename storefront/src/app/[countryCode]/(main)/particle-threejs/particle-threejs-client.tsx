"use client"

import dynamic from "next/dynamic"

/**
 * Client-only mount for the Three.js scene. Next 16 forbids
 * `dynamic({ ssr: false })` in Server Components, so the dynamic import lives
 * here and the server page renders this wrapper.
 */
const HomeParticleThree = dynamic(
  () => import("@modules/home/components/home-particle-three"),
  { ssr: false }
)

export default function ParticleThreejsClient({
  particleCount,
}: {
  particleCount: number
}) {
  return <HomeParticleThree particleCount={particleCount} />
}

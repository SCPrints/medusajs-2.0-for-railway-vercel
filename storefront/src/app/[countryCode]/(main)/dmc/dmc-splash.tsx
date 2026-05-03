"use client"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"

export default function DmcSplash() {
  return (
    <HomeParticleLogoHero
      presentation="embedded"
      interactionMode="newmix"
      logoSrc="/branding/dmc-logo.png"
      sectionAriaLabel="DMC particle logo"
    />
  )
}

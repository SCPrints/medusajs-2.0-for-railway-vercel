"use client"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"

import { V3_TUNING } from "../(main)/particle-flow/v3-splash"

export default function DmcSplash() {
  return (
    <HomeParticleLogoHero
      presentation="fullscreen"
      interactionMode="newmix"
      animatedParticleCap={55000}
      logoSrc="/branding/dmc-logo-1.png"
      inkPolarity="bright"
      sectionAriaLabel="DMC particle logo"
      newmixLiveTuning={V3_TUNING}
    />
  )
}

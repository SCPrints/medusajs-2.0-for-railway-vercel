"use client"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { NewmixLiveTuning } from "@modules/home/components/home-particle-logo-hero/newmix-live-tuning"

/**
 * SC PRints v3-era settings (commit a6abea2, May 3 11:52). User indicated these
 * produced the best result so far for the particle-flow page. Newer knobs
 * (added after v3) are set to neutral / disabled values so they don't perturb
 * the v3-era behavior.
 */
const V3_TUNING: Partial<NewmixLiveTuning> = {
  radius: 45,
  velSmoothing: 0.45,
  sideSwirlForce: 14.0,
  frontPush: 5.0,
  backInward: 3.5,
  falloffPower: 1.4,
  trailFollowMs: 4000,
  wakePace: 0.75,
  wakePaceJitter: 0.4,
  wakeLateralSpreadBmp: 3,
  wakeReleaseStaggerMs: 200,
  wakeBandSpreadBmp: 10,
  wakeAlongStretchBmp: 20,
  wakeDiffusionBmp: 0,
  wakeDiffusionHz: 0.6,
  wakeTimeOffsetMs: 3000,
  releaseVelocityKeep: 0.0,
  exitVelocityBoostBmp: 6.0,
  leadingEdgePullForce: 4.5,
  friction: 0.92,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnMs: 1500,
  homeReturnCurveBmp: 90,
  homeReturnDurationJitter: 0.7,
  homeReturnDiffusionBmp: 8,
  idleThresholdMs: 500,
  /** Knobs added after v3 — neutral / disabled so they don't perturb the v3-era behavior. */
  trailingProbability: 1.0,
  inDiskCarryFactor: 0.0,
  motionGateSpeed: 0.0,
  wakeBandTaperPower: 0.0,
  coreEjectionForce: 0.0,
  coreEjectionRadiusFrac: 0.15,
  wakeAlphaMult: 1.0,
  homeReturnSpring: 0.008,
  homeReturnFriction: 0.94,
  homeReturnGravity: 0.05,
}

export default function V3Splash() {
  return (
    <HomeParticleLogoHero
      presentation="embedded"
      interactionMode="newmix"
      animatedParticleCap={77000}
      sectionAriaLabel="SC Prints — particle flow (v3 settings)"
      newmixLiveTuning={V3_TUNING}
    />
  )
}

"use client"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { NewmixLiveTuning } from "@modules/home/components/home-particle-logo-hero/newmix-live-tuning"

/**
 * SC PRints v3-era settings (commit a6abea2, May 3 11:52). User indicated these
 * produced the best result so far for the particle-flow page. Newer knobs
 * (added after v3) are set to neutral / disabled values so they don't perturb
 * the v3-era behavior.
 */
export const V3_TUNING: Partial<NewmixLiveTuning> = {
  radius: 45,
  velSmoothing: 0.45,
  sideSwirlForce: 20.0,
  frontPush: 5.0,
  backInward: 3.5,
  falloffPower: 1.9,
  trailFollowMs: 4000,
  wakePace: 0.75,
  wakePaceJitter: 0.18,
  wakeLateralSpreadBmp: 3,
  wakeReleaseStaggerMs: 200,
  wakeBandSpreadBmp: 10,
  wakeAlongStretchBmp: 20,
  wakeDiffusionBmp: 0,
  wakeDiffusionHz: 0.6,
  wakeTimeOffsetMs: 0,
  releaseVelocityKeep: 0.0,
  exitVelocityBoostBmp: 18,
  leadingEdgePullForce: 3.5,
  friction: 0.92,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnMs: 1500,
  homeReturnCurveBmp: 90,
  homeReturnDurationJitter: 0.7,
  homeReturnDiffusionBmp: 0,
  idleThresholdMs: 500,
  /** Knobs added after v3 — neutral / disabled so they don't perturb the v3-era behavior. */
  trailingProbability: 1.0,
  inDiskCarryFactor: 0.7,
  motionGateSpeed: 0.0,
  wakeBandTaperPower: 0.4,
  coreEjectionForce: 5,
  coreEjectionRadiusFrac: 0.50,
  wakeAlphaMult: 1.0,
  homeReturnSpring: 0.008,
  homeReturnFriction: 0.93,
  homeReturnGravity: 0.05,
}

export default function V3Splash() {
  return (
    <HomeParticleLogoHero
      presentation="embedded"
      interactionMode="newmix"
      animatedParticleCap={55000}
      sectionAriaLabel="SC Prints — particle flow (v3 settings)"
      newmixLiveTuning={V3_TUNING}
    />
  )
}

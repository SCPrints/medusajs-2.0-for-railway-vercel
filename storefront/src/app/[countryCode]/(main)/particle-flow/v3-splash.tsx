"use client"

import HomeParticleLogoHero from "@modules/home/components/home-particle-logo-hero"
import type { NewmixLiveTuning } from "@modules/home/components/home-particle-logo-hero/newmix-live-tuning"

/**
 * 9-stop spectrum gradient applied to the wordmark via the hero's `wordmarkGradient`
 * prop. Each particle's colour is fixed by its HOME position projected onto a 78°
 * axis (CSS convention: 0° = up, increasing clockwise — so 78° is mostly horizontal).
 * Shared between the home page and DMC page so they read as the same brand mark.
 */
export const WORDMARK_GRADIENT = {
  angleDeg: 78,
  stops: [
    "#ff2e63",
    "#ff6b35",
    "#ffc145",
    "#c1ff45",
    "#3dcfc2",
    "#45a4ff",
    "#6c5cff",
    "#b556ff",
    "#ff56e0",
  ],
}

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
  backInward: 9,
  falloffPower: 2.4,
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
  leadingEdgePullForce: 7,
  friction: 0.95,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnMs: 1500,
  homeReturnCurveBmp: 90,
  homeReturnDurationJitter: 0.7,
  homeReturnDiffusionBmp: 0,
  idleThresholdMs: 1200,
  /** Knobs added after v3 — neutral / disabled so they don't perturb the v3-era behavior. */
  trailingProbability: 1.0,
  inDiskCarryFactor: 0.9,
  motionGateSpeed: 2.5,
  wakeBandTaperPower: 0.6,
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
      wordmarkGradient={WORDMARK_GRADIENT}
    />
  )
}

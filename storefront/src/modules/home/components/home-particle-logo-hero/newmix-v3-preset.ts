import type { NewmixLiveTuning } from "./newmix-live-tuning"

/**
 * "Newmix v3" tuning — the particle-logo physics preset that runs as the home
 * page hero. Shared by the live home hero ([countryCode]/(main)/page.tsx) and
 * its archived reference page ([countryCode]/(main)/old-hero/page.tsx) so the
 * two never drift: tune one, both update.
 */
export const NEWMIX_V3_TUNING: Partial<NewmixLiveTuning> = {
  radius: 45,
  velSmoothing: 0.45,
  sideSwirlForce: 12,
  frontPush: 5.0,
  backInward: 12,
  falloffPower: 2.4,
  trailFollowMs: 4000,
  wakePace: 0.75,
  wakePaceJitter: 0.18,
  wakeLateralSpreadBmp: 3,
  wakeReleaseStaggerMs: 200,
  wakeBandSpreadBmp: 4,
  wakeAlongStretchBmp: 20,
  wakeDiffusionBmp: 0,
  wakeDiffusionHz: 0.6,
  wakeTimeOffsetMs: 0,
  releaseVelocityKeep: 0.0,
  exitVelocityBoostBmp: 0,
  leadingEdgePullForce: 7,
  friction: 0.95,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnMs: 1500,
  homeReturnCurveBmp: 90,
  homeReturnDurationJitter: 0.7,
  homeReturnDiffusionBmp: 0,
  idleThresholdMs: 1200,
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
  vortexStrength: 6.0,
  vortexOffsetBmp: 28,
  vortexLagBmp: -6,
  vortexRadiusBmp: 38,
  vortexFalloffPower: 1.6,
}

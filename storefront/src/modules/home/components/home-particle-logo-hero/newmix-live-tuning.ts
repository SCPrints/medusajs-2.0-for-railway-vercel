/**
 * Live-tunable parameters for `interactionMode: "newmix"`.
 * Defaults mirror `constants.ts`; the RAF loop reads a merged ref updated from the tuning panel.
 */
export type NewmixLiveTuning = {
  radius: number
  velSmoothing: number
  sideSwirlForce: number
  frontPush: number
  backInward: number
  falloffPower: number
  trailFollowMs: number
  /** Playback pace for the cursor history: 1.0 = particle stays at cursor (no trail);
   * <1.0 = particle traces path slower than real time, falling behind as a wake. */
  wakePace: number
  /** Per-particle pace jitter (0..1). Each particle's pace is randomly varied by ±this fraction
   * of `wakePace`, so different particles fall behind at different rates and spread out along the trail. */
  wakePaceJitter: number
  /** Lateral drift along the trail's perpendicular over the wake duration (bitmap px).
   * Each particle gets a random sign + magnitude so the wake spreads instead of clumping. */
  wakeLateralSpreadBmp: number
  /** Per-particle release-time stagger (ms). Each particle's effective release time is
   * delayed by up to this much (deterministic from home), so particles released in the same
   * frame don't move in lockstep. */
  wakeReleaseStaggerMs: number
  /** Per-particle perpendicular offset multiplier added to the playback target. This is
   * NOT bell-shaped — it's a constant lateral offset that varies per particle, so dots
   * spread into a band along the entire trail length, not just mid-wake. */
  wakeBandSpreadBmp: number
  /** Per-particle along-tangent offset (bitmap px). Each particle gets a unique signed
   * offset along the cursor's heading so they stretch out along the trail axis, not just
   * perpendicular to it — produces a long elongated wake rather than a short clump. */
  wakeAlongStretchBmp: number
  /** Continuous diffusion noise amplitude (bitmap px). Each particle wobbles around its
   * playback position via a deterministic sine function of time + particle hash. Breaks
   * up clumping by making each particle drift along its own slow wandering path. */
  wakeDiffusionBmp: number
  /** Diffusion frequency (Hz). Higher = faster wobble; lower = slower drift. */
  wakeDiffusionHz: number
  /** Fraction of swirl velocity preserved on the release frame (lower = trail playback takes over immediately). */
  releaseVelocityKeep: number
  friction: number
  springStiffnessMult: number
  homeSpringSuppress: number
  /** Total duration of the home-return phase (ms). Each particle eases from its wake-end
   * position back to home over this time along a curved path. */
  homeReturnMs: number
  /** Random perpendicular curve magnitude (bitmap px) for the home-return path. Each particle
   * gets a unique sign + amount, so home return paths fan out instead of all converging
   * along the straight line from wake-end to home. */
  homeReturnCurveBmp: number
  /** Per-particle home-return duration jitter (0..1). Each particle's homeReturnMs is
   * varied by ±this fraction so they don't all arrive home in lockstep. */
  homeReturnDurationJitter: number
  /** Diffusion noise amplitude during home return (bitmap px). Wobbles each particle around
   * its Bezier path so the return trajectories spread out and don't appear clumped. */
  homeReturnDiffusionBmp: number
  /** Idle-gate threshold (ms). If no mouse motion for this long, capture/swirl freezes. */
  idleThresholdMs: number
}

/** Must stay aligned with `constants.ts` exports for newmix. */
export const NEWMIX_LIVE_TUNING_DEFAULTS = Object.freeze<NewmixLiveTuning>({
  radius: 92,
  velSmoothing: 0.45,
  sideSwirlForce: 8.0,
  frontPush: 3.0,
  backInward: 2.0,
  falloffPower: 1.4,
  trailFollowMs: 3000,
  wakePace: 0.55,
  wakePaceJitter: 0.85,
  wakeLateralSpreadBmp: 22,
  wakeReleaseStaggerMs: 900,
  wakeBandSpreadBmp: 28,
  wakeAlongStretchBmp: 60,
  wakeDiffusionBmp: 18,
  wakeDiffusionHz: 0.6,
  releaseVelocityKeep: 0.0,
  friction: 0.94,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnMs: 1600,
  homeReturnCurveBmp: 130,
  homeReturnDurationJitter: 0.7,
  homeReturnDiffusionBmp: 14,
  idleThresholdMs: 2000,
})

export function mergeNewmixLiveTuning(
  partial?: Partial<NewmixLiveTuning> | null
): NewmixLiveTuning {
  return {
    ...NEWMIX_LIVE_TUNING_DEFAULTS,
    ...partial,
  }
}

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
  /** Fraction of swirl velocity preserved on the release frame (lower = trail playback takes over immediately). */
  releaseVelocityKeep: number
  friction: number
  springStiffnessMult: number
  homeSpringSuppress: number
  /** Per-frame fraction of remaining distance home that's closed each tick (0..1). */
  homeReturnRate: number
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
  releaseVelocityKeep: 0.0,
  friction: 0.94,
  springStiffnessMult: 0.55,
  homeSpringSuppress: 0.85,
  homeReturnRate: 0.08,
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

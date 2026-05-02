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
  trailFollowAccel: number
  trailFollowPathBias: number
  friction: number
  springStiffnessMult: number
  homeSpringSuppress: number
  releaseKickMult: number
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
  trailFollowAccel: 0.36,
  trailFollowPathBias: 0.7,
  friction: 0.92,
  springStiffnessMult: 0.65,
  homeSpringSuppress: 0.85,
  releaseKickMult: 1.1,
})

export function mergeNewmixLiveTuning(
  partial?: Partial<NewmixLiveTuning> | null
): NewmixLiveTuning {
  return {
    ...NEWMIX_LIVE_TUNING_DEFAULTS,
    ...partial,
  }
}

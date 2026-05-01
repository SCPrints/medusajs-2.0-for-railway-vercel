/**
 * Live-tunable parameters for `interactionMode: "viscousCoffee"`.
 * Defaults mirror `constants.ts`; the RAF loop reads a merged ref updated from the tuning panel.
 */
export type ViscousCoffeeLiveTuning = {
  dragRadius: number
  trailMaxPoints: number
  sampleDistBmp: number
  pathDecay: number
  lineRadiusBmp: number
  alongStrength: number
  shearStrength: number
  springStiffness: number
  friction: number
  erodeEveryFrames: number
  spoonRepulseFalloffPower: number
  spoonFrontPush: number
  spoonSideVortex: number
  spoonRingSwirl: number
  spoonBackInward: number
  spoonHalfRadiusOrbit: number
  spoonBackWash: number
  spoonVelSmooth: number
  wakeParticleCount: number
  wakeArcHeadKeep: number
  wakeTailBackSamples: number
  wakeArcDistribGamma: number
  wakeSpreadBmp: number
  wakeSpringStiffness: number
  wakeFriction: number
  wakeAlongDrag: number
  wakeAlphaMult: number
}

/** Must stay aligned with `constants.ts` exports for viscous coffee. */
export const VISCOUS_COFFEE_LIVE_TUNING_DEFAULTS =
  Object.freeze<ViscousCoffeeLiveTuning>({
    dragRadius: 75,
    trailMaxPoints: 160,
    sampleDistBmp: 3,
    pathDecay: 0.94,
    lineRadiusBmp: 54,
    alongStrength: 0.84,
    shearStrength: 0.38,
    springStiffness: 0.03,
    friction: 0.928,
    erodeEveryFrames: 6,
    spoonRepulseFalloffPower: 1.45,
    spoonFrontPush: 6.2,
    spoonSideVortex: 3.1,
    spoonRingSwirl: 4.4,
    spoonBackInward: 2.25,
    spoonHalfRadiusOrbit: 2.0,
    spoonBackWash: 1.35,
    spoonVelSmooth: 0.42,
    wakeParticleCount: 260,
    wakeArcHeadKeep: 0.97,
    wakeTailBackSamples: 5,
    wakeArcDistribGamma: 1.38,
    wakeSpreadBmp: 13,
    wakeSpringStiffness: 0.05,
    wakeFriction: 0.935,
    wakeAlongDrag: 0.38,
    wakeAlphaMult: 0.98,
  })

export function mergeViscousCoffeeLiveTuning(
  partial?: Partial<ViscousCoffeeLiveTuning> | null
): ViscousCoffeeLiveTuning {
  return {
    ...VISCOUS_COFFEE_LIVE_TUNING_DEFAULTS,
    ...partial,
  }
}

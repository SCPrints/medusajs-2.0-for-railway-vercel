/**
 * Live-tunable parameters for the SC Prints particle-flow lab on /au/particle-flow.
 *
 * Model: deposit-and-hold with perpendicular spread.
 *  1. Cursor moving fast enough through a particle → push particle perpendicular
 *     to cursor velocity (sign decided by cross product), out to radius+spread.
 *  2. Snap velocity to zero, record park position + timestamp.
 *  3. Particle holds park position for `holdMs` (visibly stationary wake).
 *  4. After hold expires, drift home over ~`returnMs` via weak spring + small
 *     gravity + high friction (sand-through-hourglass).
 *  5. Strong inner-core radial repel keeps a clean void under the cursor.
 */
export type ScPrintsFlowTuning = {
  radius: number
  spread: number
  motionThreshold: number
  velSmoothing: number
  holdMs: number
  holdJitterMs: number
  returnSpring: number
  returnFriction: number
  returnGravity: number
  particleStride: number
  particleSize: number
}

export const SC_PRINTS_FLOW_TUNING_DEFAULTS = Object.freeze<ScPrintsFlowTuning>({
  radius: 60,
  spread: 18,
  motionThreshold: 0.6,
  velSmoothing: 0.45,
  holdMs: 2500,
  holdJitterMs: 400,
  returnSpring: 0.008,
  returnFriction: 0.94,
  returnGravity: 0.05,
  particleStride: 2,
  particleSize: 1.0,
})

export function mergeScPrintsFlowTuning(
  partial?: Partial<ScPrintsFlowTuning> | null
): ScPrintsFlowTuning {
  return {
    ...SC_PRINTS_FLOW_TUNING_DEFAULTS,
    ...partial,
  }
}

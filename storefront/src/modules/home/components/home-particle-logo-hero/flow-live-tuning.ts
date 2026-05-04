/**
 * Live-tunable parameters for `interactionMode: "flow"`.
 * A fluid-flow / spoon-through-liquid interaction model:
 *  - cursor is a solid obstacle; particles inside its radius are displaced to the rim
 *  - displaced particles are given a velocity equal to `carryFactor` of cursor motion
 *  - free physics from there: spring toward home + friction + gravity
 *  - no capture state, no impulse stacking, no history-buffer playback
 */
export type FlowLiveTuning = {
  /** Cursor radius in bitmap px. Particles within this distance are displaced to the rim. */
  radius: number
  /** Strength of the radial-edge displacement per frame (0..1 lerp). 1.0 = instantaneous
   * push to the rim; lower = smooth slide outward. */
  displacementStrength: number
  /** Tangential offset magnitude as a fraction of radius. Adds a sliding-around-the-cursor
   * component to the displacement so particles flow around the obstacle rather than just
   * being pushed straight out. */
  tangentialBias: number
  /** Fraction of cursor's smoothed velocity transferred to displaced particles each frame.
   * Higher = particles get carried along strongly, producing long trails. */
  carryFactor: number
  /** Low-pass smoothing on the cursor velocity (0..1 per frame). Higher = snappier
   * tracking, lower = smoother averaged motion. */
  velSmoothing: number
  /** Spring stiffness pulling free particles toward home each frame. Lower = slow drift. */
  springStiffness: number
  /** Velocity multiplier each frame for free particles. Critical damping requires
   * `friction ≈ 1 - 2·sqrt(spring)` — at spring 0.005, friction ~0.88 is critical. */
  friction: number
  /** Downward gravity acceleration each frame (bitmap px/frame²). Produces the "sand
   * through hourglass" fall pattern as particles return home. */
  gravity: number
  /** Mouse speed (bitmap px/frame) below which `carryFactor` fades to 0. Stationary
   * cursor still displaces but doesn't impart velocity. */
  motionGateSpeed: number
  /** Velocity transferred to a particle on the displacement frame is blended with the
   * particle's existing velocity using this weight (0..1). 1.0 = full replace; lower =
   * smoother momentum continuity. */
  velocityHandoff: number
  /** Carry-state duration (ms). When a particle is displaced, it enters a "carried" state
   * for this long. While carried, it continues receiving the cursor's velocity vector
   * each frame (continuous push, not one-shot) so it travels far along the cursor's path
   * — producing the visible long trail. After expiring, particle drops into free physics. */
  carryDurationMs: number
  /** Strength of the per-frame velocity acceleration applied to carried particles. Higher
   * = particles match cursor speed more aggressively; lower = looser drift. */
  carryStrength: number
  /** Velocity multiplier each frame for CARRIED particles (separate from `friction` which
   * applies to free particles). Should be high (~0.96+) so velocity persists through the
   * carry window for long visible trails. */
  carryFriction: number
  /** Home-spring suppression while carried (0..1). 1.0 = home spring fully off; lower =
   * partial pull home even while carried. Keeping this near 1 ensures the trail can
   * extend far from home. */
  carryHomeSpringSuppress: number
}

export const FLOW_LIVE_TUNING_DEFAULTS = Object.freeze<FlowLiveTuning>({
  radius: 50,
  displacementStrength: 1.0,
  tangentialBias: 0.25,
  carryFactor: 0.7,
  velSmoothing: 0.45,
  springStiffness: 0.005,
  friction: 0.88,
  gravity: 0.05,
  motionGateSpeed: 1.5,
  velocityHandoff: 0.6,
  carryDurationMs: 2500,
  carryStrength: 0.45,
  carryFriction: 0.965,
  carryHomeSpringSuppress: 1.0,
})

export function mergeFlowLiveTuning(
  partial?: Partial<FlowLiveTuning> | null
): FlowLiveTuning {
  return {
    ...FLOW_LIVE_TUNING_DEFAULTS,
    ...partial,
  }
}

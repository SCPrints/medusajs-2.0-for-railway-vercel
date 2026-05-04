/**
 * Live-tunable parameters for `interactionMode: "displaced"`.
 * Set-position model: the cursor displaces particles to its rim on the perpendicular-to-
 * motion axis (left or right depending on which side the particle is on). Displaced
 * particles HOLD their new position for `displaceTimeMs` with a very weak home spring +
 * high friction (so they barely drift), then drift home via spring + friction + gravity.
 *
 * The wake is the cumulative pattern of held-position particles along the cursor's
 * recent path. NOT moving particles being pushed by forces.
 */
export type DisplacedLiveTuning = {
  /** Cursor radius (bitmap px). Particles inside this distance are continuously snapped
   * to the perpendicular rim while the cursor is moving. */
  radius: number
  /** Mouse speed threshold (bitmap px/frame) below which displacement is suppressed.
   * Stationary cursor doesn't displace; moving cursor does. */
  motionThreshold: number
  /** How long a displaced particle holds its position (ms) before dropping into the
   * free-physics drift-home phase. */
  displaceTimeMs: number
  /** Home-spring stiffness while a particle is in the held / displaced phase. Very
   * weak so the particle barely moves — the trail "stays in place" until the timer
   * expires. */
  holdSpring: number
  /** Friction multiplier per frame while held. High (~0.96) so any velocity dies and
   * the particle stays planted. */
  holdFriction: number
  /** Home-spring stiffness during the post-hold drift-home phase. */
  returnSpring: number
  /** Friction multiplier per frame during return drift. */
  returnFriction: number
  /** Downward gravity acceleration during return drift (bitmap px/frame²) — produces
   * the "sand through hourglass" fall as particles return home. */
  returnGravity: number
}

export const DISPLACED_LIVE_TUNING_DEFAULTS = Object.freeze<DisplacedLiveTuning>({
  radius: 60,
  motionThreshold: 0.5,
  displaceTimeMs: 4000,
  holdSpring: 0.003,
  holdFriction: 0.96,
  returnSpring: 0.008,
  returnFriction: 0.94,
  returnGravity: 0.05,
})

export function mergeDisplacedLiveTuning(
  partial?: Partial<DisplacedLiveTuning> | null
): DisplacedLiveTuning {
  return {
    ...DISPLACED_LIVE_TUNING_DEFAULTS,
    ...partial,
  }
}

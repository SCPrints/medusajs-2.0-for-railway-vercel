/**
 * Single visible stipple: animated particles on canvasC only (see ANIMATED_PARTICLE_CAP).
 * Canvases O/A stay cleared — avoids a “frozen” double layer vs newmix-style motion.
 */
export const ANIMATED_PARTICLE_CAP = 15000

/** Cursor influence radius in bitmap px. */
export const DRAG_RADIUS = 450
/** Snowplow: pushes particles outward along (particle − mouse). */
export const PUSH_FORCE = 0.58
/** Adds velocity along the mouse delta vector while the pointer moves in range. */
export const SMEAR_FORCE = 1.05
/** Tangential twist coefficient (paired with perpendicular to radial). */
export const SWIRL_FORCE = 3.5
/** Pull toward home position (hx, hy) per frame. */
export const SPRING_STIFFNESS = 0.014
/** Velocity damping after integration step. */
export const FRICTION = 0.935
/** Skip normalize / radial when dist is ~0 to avoid NaN. */
export const PHYSICS_DIST_EPSILON = 1e-6

/** Per-particle opacity ~ U(MIN, MIN+RANGE); slightly more black speckle in fill (GIF-like grain). */
export const PARTICLE_ALPHA_MIN = 0.085
export const ANIMATED_PARTICLE_ALPHA_MULT = 1.42
export const PARTICLE_ALPHA_RANGE = 0.36

/** Small randomized dot radius in CSS px: MIN + U(0, RANGE). */
export const PARTICLE_RADIUS_MIN_CSS = 0.45
export const PARTICLE_RADIUS_RANGE_CSS = 1.05

/** Peak displacement in CSS px; scales into bitmap via canvas sx/sy. */
export const WOBBLE_AMP_X_CSS = 13
export const WOBBLE_AMP_Y_COS_SCALE = 0.72
export const WOBBLE_Y_ANGLE_SPEED_SCALE = 0.7
/**
 * Base angular velocity in rad/s before per-particle multiplier (0.5…1.5).
 */
export const WOBBLE_RAD_PER_SEC_BASE = 4.25

/** Hot-path draw: rects instead of arcs (bitmap px); large size counters DPR + overlaps into fluid. */
export const PARTICLE_DRAW_SIZE_BMP = 12.0
/** Lower alpha + large rects → milky glow instead of a flat slab. */
export const PARTICLE_FILL_STYLE = "rgba(255, 255, 255, 0.4)"
export const PARALLAX_EASE = 0.06
/** Visual + physics parallax strength (draw `ctx.translate`; mouse offset in tick). */
export const PARALLAX_MULT_C = 3
export const PARALLAX_MOUSE_SENSITIVITY = 0.32

/** How fast wobble strength 0→1 when pointer is moving over the logo. */
export const WOBBLE_ENERGY_RISE_PER_SEC = 3.2
/** How fast wobble settles back when pointer is still or leaves. */
export const WOBBLE_ENERGY_DECAY_PER_SEC = 1.35

/** Deterministic stipple variance for the static base layer (0…1). */
export function stippleHash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return (h >>> 0) / 4294967296
}

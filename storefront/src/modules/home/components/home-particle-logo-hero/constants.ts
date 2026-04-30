/**
 * Single visible stipple: animated particles on canvasC only (see ANIMATED_PARTICLE_CAP).
 * Canvases O/A stay cleared — avoids a “frozen” double layer vs newmix-style motion.
 */
export const ANIMATED_PARTICLE_CAP = 32000

/**
 * Fraction of particles whose home `(hx, hy)` is uniform across the full hero bitmap `W×H`.
 * Set to `0` for logo-only stipple on a bare background (no ambient field).
 */
export const FULL_HERO_HOME_FRACTION = 0

/** Cursor influence radius in bitmap px. */
export const DRAG_RADIUS = 140
/**
 * Radial push uses `falloff ** PUSH_FALLOFF_POWER` so outer ring doesn’t launch particles.
 * Higher = tighter “snow swirl” around the cursor.
 */
export const PUSH_FALLOFF_POWER = 2.05
/** Snowplow: pushes particles outward along (particle − mouse). */
export const PUSH_FORCE = 0.36
/** Adds velocity along the per-frame mouse delta while the pointer moves in range. */
export const SMEAR_FORCE = 0.72
/**
 * Wake smear uses `falloff ** SMEAR_FALLOFF_POWER` (≥1) to keep a dense viscous core in the trail.
 */
export const SMEAR_FALLOFF_POWER = 1.35
/** Tangential twist coefficient (perpendicular to radial); paired with SMEAR in the wake path. */
export const SWIRL_FORCE = 2.15
/** Multiplier on tangential swirl near the cursor (direct + trail). */
export const SWIRL_AMP = 1.05
/**
 * When false, skips smear + constant tangential swirl only (still applies radial PUSH_FORCE when coupled).
 */
export const MOUSE_CURSOR_WAKE_PHYSICS_ENABLED = true
/**
 * When false: no stipple-layer parallax pan with the pointer, no radial repulsion (PUSH_FORCE),
 * and wobble does not ramp from pointer motion. (Wake/smear is separate — see
 * MOUSE_CURSOR_WAKE_PHYSICS_ENABLED.)
 */
export const MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED = true
/** Pull toward home position (hx, hy) per frame; lower = slower drift back (“more delay”). */
export const SPRING_STIFFNESS = 0.0042
/**
 * Bitmap px from home: below this, spring onto `(hx, hy)` eases off for a softer final settle.
 */
export const SETTLE_SLOW_ZONE_BMP = 36
/** `0…1` — additional spring attenuation when inside `SETTLE_SLOW_ZONE_BMP` (lower = slower creep-in). */
export const SETTLE_SPRING_NEAR_SCALE = 0.5
/** Extra multiplier on spring acceleration in the tick loop. */
export const SPRING_GAIN = 1
/** Velocity damping after integration step. */
export const FRICTION = 0.948

/** Full-viewport demo: heavier viscous drag (see particle-logo page). */
export const FULLSCREEN_FRICTION = 0.94

/** Full-viewport demo: stronger home spring than embedded `SPRING_STIFFNESS`. */
export const FULLSCREEN_SPRING_STIFFNESS = 0.02
/**
 * Hard cap on particle speed (bitmap px/frame) after forces — stops explosive first hits.
 */
export const PARTICLE_MAX_VELOCITY_BMP = 12.5
/** Skip normalize / radial when dist is ~0 to avoid NaN. */
export const PHYSICS_DIST_EPSILON = 1e-6

/**
 * Ms after last qualifying stir: particles keep coasting along the smoothed trail, then spring home.
 * Re-entering the swirl (move near logo / interact) refreshes this window.
 */
export const POINTER_TRAIL_MEMORY_MS = 3500
/** Blends bitmap pointer delta into trail velocity while the cursor is coupled to particles. */
export const TRAIL_VELOCITY_BLEND = 0.46
/**
 * When the pointer stops, trail velocity still feeds the swirl (spoon drag). 0…1 — higher = longer “cream” tail.
 */
export const SPOON_TRAIL_DRAG = 0.78
/** Extra tangential swirl scales with trail speed (coffee-cup stir read). */
export const SPOON_SWIRL_SPEED_SCALE = 0.32
/** Per-frame retention of trail velocity while the pointer is still (wake only). */
export const TRAIL_VELOCITY_IDLE_RETENTION = 0.992
/**
 * Recent pointer samples (bitmap px) for an elongated “coffee trail”: smear + swirl extend
 * along where the cursor just moved, not only under the current disk.
 */
export const TRAIL_PATH_MAX_SAMPLES = 12
export const TRAIL_PATH_MIN_SPACING_BMP = 6
/** Wake radius around each past sample (bitmap px). */
export const TRAIL_PATH_WAKE_RADIUS_BMP = 94
/** Older samples weigh less (0…1); newest stays full strength. */
export const TRAIL_PATH_SAMPLE_DECAY = 0.86
/** Scales smear from path samples vs the live cursor disk. */
export const TRAIL_PATH_SMEAR_MULT = 0.4
/** Scales tangential swirl around each path sample (spoon-in-coffee read). */
export const TRAIL_PATH_SWIRL_MULT = 0.48
/** Skip path samples this close to the live cursor — main disk already applies forces. */
export const TRAIL_PATH_SKIP_NEAR_CURSOR_BMP = 52
/**
 * After `POINTER_TRAIL_MEMORY_MS`, particles ease home; snap to exact `(hx,hy)` when nearly
 * still so the wordmark is visually static at rest.
 */
export const PARTICLE_REST_SNAP_DIST_BMP = 0.75
export const PARTICLE_REST_SNAP_VSQ = 0.00055
/** Extra velocity damping near home while uncoupled (kills micro-shimmer). */
export const SETTLE_UNCOUPLED_FRICTION_MULT = 1.045
export const SETTLE_UNCOUPLED_FRICTION_ZONE_BMP = 14
/** Min mouse delta² in bitmap px² to count as motion for wake clock + trail blend. */
export const POINTER_MOVE_EPS_BMP_SQ = 0.05 * 0.05

/** Per-particle base opacity ~ U(MIN, MIN+RANGE) before `ANIMATED_PARTICLE_ALPHA_MULT` and cap. */
export const PARTICLE_ALPHA_MIN = 0.12
export const ANIMATED_PARTICLE_ALPHA_MULT = 1.58
export const PARTICLE_ALPHA_RANGE = 0.24
/** Upper clamp in `drawLayer` so overlapping logo stipple reads almost solid at rest. */
export const PARTICLE_ALPHA_CAP = 0.9

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

/** Brand teal; matches `globals.css` `--brand-accent` (#3dcfc2). */
export const PARTICLE_BRAND_R = 61
export const PARTICLE_BRAND_G = 207
export const PARTICLE_BRAND_B = 194

/** Ambient stipple (homes on full hero, not from logo mask). */
export const PARTICLE_AMBIENT_R = 255
export const PARTICLE_AMBIENT_G = 255
export const PARTICLE_AMBIENT_B = 255

/** Hot-path draw: rects instead of arcs (bitmap px); larger = thicker resting wordmark. */
export const PARTICLE_DRAW_SIZE_BMP = 8

/** Fullscreen particle page: finer stipple (see `HomeParticleLogoHero` draw path). */
export const FULLSCREEN_PARTICLE_DRAW_SIZE_BMP = 5

/**
 * Fullscreen logo scale cap inside the viewport (lower = smaller wordmark, more safe margin).
 */
export const FULLSCREEN_LOGO_PAD = 0.8

/**
 * Shift stipple + mask downward (CSS px) so the mark clears the top of the frame / nav overlap.
 */
export const FULLSCREEN_LOGO_NUDGE_Y_CSS = 68

/**
 * On load, particles start in a cluster near the top-left (`spread` × min(W,H)), then spring home.
 */
export const FULLSCREEN_ASSEMBLE_MS = 2800

/** Spring multiplier while the TL → logo assembly is active. */
export const FULLSCREEN_ASSEMBLE_SPRING_MULT = 2.35

/** Initial cluster radius as a fraction of min(bitmap W, H). */
export const FULLSCREEN_SPAWN_SPREAD_FRAC = 0.085
export const PARALLAX_EASE = 0.06
/** Visual + physics parallax strength (draw `ctx.translate`; mouse offset in tick). */
export const PARALLAX_MULT_C = 3
/** Draws magenta disk at cursor on the animated canvas — for debugging alignment only. */
export const SHOW_MOUSE_CURSOR_DEBUG_MARKER = false
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

/**
 * Single visible stipple: animated particles on canvasC only (see ANIMATED_PARTICLE_CAP).
 */
export const ANIMATED_PARTICLE_CAP = 32000

/**
 * Fraction of particles whose home `(hx, hy)` is uniform across the full hero bitmap `W×H`.
 * Set to `0` for logo-only stipple on a bare background (no ambient field).
 */
export const FULL_HERO_HOME_FRACTION = 0

/**
 * Cursor influence radius in bitmap px (~50–100 CSS-equivalent at dpr 1–2 on typical viewports).
 */
export const DRAG_RADIUS = 75
/** Scales radial repulsion (paired with inverse-distance falloff below). */
export const PUSH_FORCE = 5
/**
 * Repulse uses `((R - dist) / R) ** POWER` — power > 1 ⇒ much stronger push near the cursor,
 * weaker at the edge of the disk (inverse mapping to distance).
 */
export const PUSH_REPULSE_FALLOFF_POWER = 1.45
export const SWIRL_FORCE = 2.0
export const SPRING_STIFFNESS = 0.075
/** Velocity retention per frame; lower ⇒ faster dissipation of jitter (tuned 0.85–0.92). */
export const FRICTION = 0.88

/** Skip division when `(particle − mouse)` length is ~0. */
export const PHYSICS_DIST_EPSILON = 1e-6

/** Fixed stipple opacity (crisp logo; no per-dot random variance). */
export const PARTICLE_BASE_ALPHA = 0.24
export const ANIMATED_PARTICLE_ALPHA_MULT = 1.58
export const PARTICLE_ALPHA_MIN = 0.12
export const PARTICLE_ALPHA_CAP = 0.9

export const PARTICLE_RADIUS_MIN_CSS = 0.45

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
 * On load (unless reduced motion): particles start near the top-left, fade in, and ease into
 * `(hx, hy)` over this duration. Screen bottom-right homes move first; top-left homes last.
 */
export const PARTICLE_ENTRANCE_DURATION_MS = 2000
/**
 * Latest start time within the timeline as a fraction of `PARTICLE_ENTRANCE_DURATION_MS`.
 * `0.75` ⇒ the most-delayed particles begin moving at 75% of the way into the entrance.
 */
export const PARTICLE_ENTRANCE_STAGGER_FRAC = 0.75
/** Spawn cloud span as a fraction of `min(bitmap W, H)` (top-left cluster). */
export const PARTICLE_ENTRANCE_SPAWN_SPREAD_FRAC = 0.085

export const PARALLAX_EASE = 0.06
/** Visual + physics parallax strength (draw `ctx.translate`; mouse offset in tick). */
export const PARALLAX_MULT_C = 3
/**
 * 3D tilt of the logo stack when the cursor is over the stipple (embedded + fullscreen).
 * `nx`,`ny` from canvas center ∈ about [−1,1] map to `rotateY`,`rotateX` (degrees).
 */
export const LOGO_TILT_MAX_DEG = 9
/** Per-frame exponential smoothing for tilt (higher = snappier). */
export const LOGO_TILT_SMOOTHING = 0.16
/** CSS `perspective` on the tilt parent (px). */
export const LOGO_TILT_PERSPECTIVE_PX = 1000
/** Draws magenta disk at cursor on the animated canvas — for debugging alignment only. */
export const SHOW_MOUSE_CURSOR_DEBUG_MARKER = false
export const PARALLAX_MOUSE_SENSITIVITY = 0.32

/**
 * When false: no stipple-layer parallax pan with the pointer.
 */
export const MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED = true

/**
 * `interactionMode: "fluidWake"` — decaying radial push along recent pointer samples (“spoon in coffee”).
 */
export const WAKE_TRAIL_MAX_POINTS = 28
/** Min bitmap px between stored trail samples. */
export const WAKE_TRAIL_SAMPLE_DIST_BMP = 5
/** Weight multiplier per step toward older trail samples. */
export const WAKE_TRAIL_AGE_DECAY = 0.87
/** Influence radius for a trail sample vs `DRAG_RADIUS`. */
export const WAKE_TRAIL_RADIUS_FRAC = 0.68
/** Peak impulse scale for a trail sample vs the live cursor disk (1.0). */
export const WAKE_TRAIL_FORCE_FRAC = 0.38
/** Softer spring / higher friction retention for lingering wake motion. */
export const WAKE_SPRING_STIFFNESS = 0.044
export const WAKE_FRICTION = 0.934
/** Trail samples use slightly milder swirl than the live cursor. */
export const WAKE_TRAIL_SWIRL_FRAC = 0.88

/**
 * `interactionMode: "blackHole"` — inward pull + swirl; weak home spring near cursor (“captured” disk).
 */
/** Influence radius vs `DRAG_RADIUS`. */
export const BLACK_HOLE_RADIUS_MULT = 1.22
/** Inward radial acceleration scale (bitmap-space, per frame). */
export const BLACK_HOLE_PULL_FORCE = 4.25
/** Accretion swirl vs `SWIRL_FORCE`. */
export const BLACK_HOLE_SWIRL_MULT = 2.65
/** Inside this distance, outward “ring hold” fights the singularity so dots form a disk. */
export const BLACK_HOLE_RING_HOLD_DIST_BMP = 16
/** Outward push when `dist` < ring hold (stronger at center). */
export const BLACK_HOLE_RING_PUSH = 1.38
/**
 * At cursor center reduce home-spring to `(1 - suppress)`; edge of hole → full spring.
 * Keeps captured particles orbiting instead of snapping to logo homes.
 */
export const BLACK_HOLE_HOME_SPRING_SUPPRESS = 0.93
/** Global spring scale for this mode (weaker = easier to hold in well). */
export const BLACK_HOLE_SPRING_STIFFNESS_MULT = 0.62
export const BLACK_HOLE_FRICTION = 0.902
/**
 * After a particle **leaves** the capture disk (`bhRadius`), it follows the cursor this many ms;
 * if it has not re-entered the disk, home spring returns it to the logo.
 */
export const BLACK_HOLE_TRAIL_FOLLOW_MS = 3000
/** Per-frame acceleration scale (bitmap px) steering trail particles toward the cursor. */
export const BLACK_HOLE_TRAIL_FOLLOW_ACCEL = 0.52

/**
 * `interactionMode: "viscousCoffee"` — polyline path memory: tangent drag + shear along stroke, viscous slow fill-in.
 */
export const VISCOUS_COFFEE_TRAIL_MAX_POINTS = 40
export const VISCOUS_COFFEE_SAMPLE_DIST_BMP = 4
/** Weight falloff for older segments along the path (newer stroke dominates). */
export const VISCOUS_COFFEE_PATH_DECAY = 0.9
/** Half-width of influence corridor around each path segment (bitmap px). */
export const VISCOUS_COFFEE_LINE_RADIUS_BMP = 44
/** Along-stroke “drag” (viscous coffee following the spoon direction). */
export const VISCOUS_COFFEE_ALONG_STRENGTH = 0.72
/** Normal displacement (groove walls / shearing). */
export const VISCOUS_COFFEE_SHEAR_STRENGTH = 0.38
/** Live cursor repulse vs full `PUSH_FORCE` / swirl. */
export const VISCOUS_COFFEE_LIVE_PUSH_FRAC = 0.48
export const VISCOUS_COFFEE_LIVE_SWIRL_FRAC = 0.62
/** Slow return to logo homes. */
export const VISCOUS_COFFEE_SPRING_STIFFNESS = 0.03
export const VISCOUS_COFFEE_FRICTION = 0.928
/** When pointer leaves stipple, drop oldest path point every N ticks (fading memory). */
export const VISCOUS_COFFEE_ERODE_EVERY_FRAMES = 3

/** Extra dots that ride the spoon polyline (bottom `viscousCoffee` only); spring-lagged behind moving targets. */
export const VISCOUS_COFFEE_WAKE_PARTICLE_COUNT = 72
/** Last wake dot stops this fraction of total stroke length short of the freshest sample (keeps wake behind cursor). */
export const VISCOUS_COFFEE_WAKE_ARC_HEAD_KEEP = 0.88
/** Lateral spread along trail normal (bitmap px) — slightly thickens the visible wake. */
export const VISCOUS_COFFEE_WAKE_SPREAD_BMP = 8
/** Slightly snappier than logo particles so the wake reads as a coherent “stripe”. */
export const VISCOUS_COFFEE_WAKE_SPRING_STIFFNESS = 0.055
export const VISCOUS_COFFEE_WAKE_FRICTION = 0.905
/** Multiplier on `PARTICLE_BASE_ALPHA` when the trail has enough length to show. */
export const VISCOUS_COFFEE_WAKE_ALPHA_MULT = 0.92

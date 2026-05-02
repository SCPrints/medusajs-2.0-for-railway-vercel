/**
 * Single visible stipple: animated particles on canvasC only (see ANIMATED_PARTICLE_CAP).
 */
export const ANIMATED_PARTICLE_CAP = 10500

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
export const PARTICLE_DRAW_SIZE_BMP = 3

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
export const PARTICLE_ENTRANCE_DURATION_MS = 2400
/**
 * Latest start time within the timeline as a fraction of `PARTICLE_ENTRANCE_DURATION_MS`.
 * `0.92` ⇒ the most-delayed particles begin moving at 92% of the way into the entrance.
 */
export const PARTICLE_ENTRANCE_STAGGER_FRAC = 0.92
/** Spawn cloud span as a fraction of `min(bitmap W, H)` (top-left cluster). */
export const PARTICLE_ENTRANCE_SPAWN_SPREAD_FRAC = 0.55
/** Per-particle entrance duration jitter (±this fraction). Higher = wider arrival window. */
export const PARTICLE_ENTRANCE_DURATION_JITTER = 0.35
/** Per-particle Bezier curve magnitude (bitmap px) on the entrance path. Each particle
 * gets a unique sweep angle so trajectories fan out instead of all being straight lines. */
export const PARTICLE_ENTRANCE_CURVE_BMP = 140
/** Sine-noise wobble amplitude during entrance (bitmap px). Particles drift on their own
 * irregular paths instead of clean straight-line lerps. */
export const PARTICLE_ENTRANCE_DIFFUSION_BMP = 22
/** Per-particle along-trajectory drift (bitmap px). Stretches the spawn cloud along its
 * long axis so density falls off gradually rather than in a hard pocket. */
export const PARTICLE_ENTRANCE_SPAWN_TAIL_BMP = 280

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
/** Longer polyline = mouse wake persists farther (bottom viscousCoffee). */
export const VISCOUS_COFFEE_TRAIL_MAX_POINTS = 160
export const VISCOUS_COFFEE_SAMPLE_DIST_BMP = 3
/** Weight falloff for older segments along the path (higher = longer “memory”). */
export const VISCOUS_COFFEE_PATH_DECAY = 0.94
/** Half-width of influence corridor around each path segment (bitmap px). */
export const VISCOUS_COFFEE_LINE_RADIUS_BMP = 54
/** Along-stroke “drag” (viscous coffee following the spoon direction). */
export const VISCOUS_COFFEE_ALONG_STRENGTH = 0.84
/** Normal displacement (groove walls / shearing). */
export const VISCOUS_COFFEE_SHEAR_STRENGTH = 0.38
/** Slow return to logo homes. */
export const VISCOUS_COFFEE_SPRING_STIFFNESS = 0.03
export const VISCOUS_COFFEE_FRICTION = 0.928
/** When pointer leaves stipple, drop oldest path point every N ticks (slower = longer trailing wake). */
export const VISCOUS_COFFEE_ERODE_EVERY_FRAMES = 6

/**
 * Spoon-through-coffee live disk (bottom `viscousCoffee` only): directional vortex + ring flow + rear wash.
 * Uses motion vector from trail; front = push out, sides = counter-rotating swirl, back = inward + half-R orbit + drift into wake.
 */
export const VISCOUS_COFFEE_SPOON_FRONT_PUSH = 6.2
export const VISCOUS_COFFEE_SPOON_SIDE_VORTEX = 3.1
export const VISCOUS_COFFEE_SPOON_RING_SWIRL = 4.4
export const VISCOUS_COFFEE_SPOON_BACK_INWARD = 2.25
export const VISCOUS_COFFEE_SPOON_HALF_RADIUS_ORBIT = 2.0
/** Drag along −motion behind the spoon so fluid feeds into the polyline wake. */
export const VISCOUS_COFFEE_SPOON_BACK_WASH = 1.35
/** Low-pass motion from trail samples (0…1), higher = faster heading lock. */
export const VISCOUS_COFFEE_SPOON_VEL_SMOOTH = 0.42

/**
 * Extra stipple along the spoon polyline (bottom `viscousCoffee` only).
 * Higher count + softer spring ≈ long, brushy trail like crema behind the cursor.
 */
export const VISCOUS_COFFEE_WAKE_PARTICLE_COUNT = 260
/** Use almost the full stroke so the visible trail stretches behind the spoon. */
export const VISCOUS_COFFEE_WAKE_ARC_HEAD_KEEP = 0.97
/**
 * Leave this many newest polyline samples “ahead” of the wake so the ribbon sits behind the cursor,
 * not stacked on the live tip.
 */
export const VISCOUS_COFFEE_WAKE_TAIL_BACK_SAMPLES = 5
/**
 * `u = (i/(N-1)) ** GAMMA` maps dot index → arc position. Above 1 biases density toward the older
 * end of the stroke (longer visible tail behind the spoon).
 */
export const VISCOUS_COFFEE_WAKE_ARC_DISTRIB_GAMMA = 1.38
/** Lateral spread along trail normal (bitmap px) — thicker “ribbon”. */
export const VISCOUS_COFFEE_WAKE_SPREAD_BMP = 13
/** Lower = more lag / smear along the path (longer lived motion). */
export const VISCOUS_COFFEE_WAKE_SPRING_STIFFNESS = 0.05
export const VISCOUS_COFFEE_WAKE_FRICTION = 0.935
/** Each frame, nudge wake dots along local stroke tangent (toward newer samples) — reads as “chasing” the mouse. */
export const VISCOUS_COFFEE_WAKE_ALONG_DRAG = 0.38
/** Multiplier on `PARTICLE_BASE_ALPHA` when the trail has enough length to show. */
export const VISCOUS_COFFEE_WAKE_ALPHA_MULT = 0.98

/**
 * `interactionMode: "newmix"` — direction-aware swirl capture + 3s wake follow.
 * Inspired by https://www.newmixcoffee.com — particles in the disk sweep to opposite sides
 * based on which side of the smoothed motion vector they sit on, transit the disk once, then
 * trail the cursor for `NEWMIX_TRAIL_FOLLOW_MS` along the recent path before springing home.
 * Reuses the `bhPrevInRadius` / `bhTrailUntilMs` particle fields for release-edge detection
 * and the deadline timer (renamed conceptually but the storage is shared with `blackHole`).
 */
/** Capture disk radius (bitmap px) — comparable to `BLACK_HOLE_RADIUS_MULT * DRAG_RADIUS ≈ 91.5`. */
export const NEWMIX_RADIUS_BMP = 92
/** Polyline length used for trail-follow target lookup (not for force corridor). */
export const NEWMIX_TRAIL_MAX_POINTS = 60
/** Min bitmap px between stored trail samples. */
export const NEWMIX_TRAIL_SAMPLE_DIST_BMP = 4
/** Low-pass on inferred motion direction from pointer deltas (mirrors `VISCOUS_COFFEE_SPOON_VEL_SMOOTH`). */
export const NEWMIX_VEL_SMOOTHING = 0.45
/** Counter-rotating side vortex — much higher than viscous's `3.1` because particles transit
 * the disk for only a handful of frames (impulse ≈ force × frames × falloff). */
export const NEWMIX_SIDE_SWIRL_FORCE = 8.0
/** Mild outward push in the direction of motion (clears the tip). */
export const NEWMIX_FRONT_PUSH = 3.0
/** Pinch behind the cursor pulls released particles into the wake. */
export const NEWMIX_BACK_INWARD = 2.0
/** `((R - dist) / R) ^ POWER` — sharper near center, softer at the edge. */
export const NEWMIX_FALLOFF_POWER = 1.4
/** Wake-follow window after release (matches `BLACK_HOLE_TRAIL_FOLLOW_MS`). */
export const NEWMIX_TRAIL_FOLLOW_MS = 3000
/** Per-frame steering acceleration toward the hybrid trail/cursor target. */
export const NEWMIX_TRAIL_FOLLOW_ACCEL = 0.36
/** Hybrid lerp: at release `u≈1` weights the most recent trail sample by this much, decays to 0. */
export const NEWMIX_TRAIL_FOLLOW_PATH_BIAS = 0.7
/** Per-frame velocity retention (slightly higher than `BLACK_HOLE_FRICTION = 0.902`). */
export const NEWMIX_FRICTION = 0.92
/** Global home-spring scale (weaker than default so captured dots can drift). */
export const NEWMIX_SPRING_STIFFNESS_MULT = 0.65
/** At cursor center reduce home-spring to `(1 - suppress)`. */
export const NEWMIX_HOME_SPRING_SUPPRESS = 0.85
/** Single-frame velocity multiplier on the edge-exit frame so released particles
 * leave with enough tangential speed to read as having completed one swirl. */
export const NEWMIX_RELEASE_KICK_MULT = 1.1

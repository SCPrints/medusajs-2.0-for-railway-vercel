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
export const PUSH_FORCE = 0.65
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
 * Fullscreen particle page: particles spawn in a cluster off the upper-left, then spring into `(hx, hy)`.
 */
export const FULLSCREEN_ASSEMBLE_MS = 2800
/** Spring multiplier while the fly-in is active (snappier settle into the wordmark). */
export const FULLSCREEN_ASSEMBLE_SPRING_MULT = 2.35
/** Spawn cloud radius as a fraction of `min(bitmap W, H)`. */
export const FULLSCREEN_SPAWN_SPREAD_FRAC = 0.085

export const PARALLAX_EASE = 0.06
/** Visual + physics parallax strength (draw `ctx.translate`; mouse offset in tick). */
export const PARALLAX_MULT_C = 3
/** Draws magenta disk at cursor on the animated canvas — for debugging alignment only. */
export const SHOW_MOUSE_CURSOR_DEBUG_MARKER = false
export const PARALLAX_MOUSE_SENSITIVITY = 0.32

/**
 * When false: no stipple-layer parallax pan with the pointer.
 */
export const MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED = true

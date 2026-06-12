/**
 * Layout constants for the cubic lookbook gallery.
 *
 * The card payload type + fallback data are shared with the sphere prototype
 * (re-exported below) so the two galleries stay in lockstep — only the tile
 * layout differs. Lives here, NOT in the "use client" module: values imported
 * from a client module into a server component become opaque client
 * references, not numbers.
 */
export { FALLBACK_PROJECTS } from "../lookbook-sphere/projects"
export type { SphereProject as CubeProject } from "../lookbook-sphere/projects"

/** Tiles per row/column on each face. */
export const CUBE_GRID = 5
/** Total tiles on the cube (6 faces × 5×5 = 150). */
export const CUBE_TILE_COUNT = 6 * CUBE_GRID * CUBE_GRID

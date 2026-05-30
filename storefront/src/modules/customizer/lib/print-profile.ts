/**
 * Storefront-side print-profile types + derive helpers.
 *
 * A "print profile" is the explicit, admin-managed replacement for the old
 * title/tag inference that decided which sides/methods/sizes the customizer
 * offered. The backend resolves a product's `metadata.print_profile` handle (or
 * inline `metadata.print_config`) into a list of areas; this module turns those
 * areas into the side / method / size gates the customizer template consumes.
 *
 * Vocabulary mirrors backend/src/lib/print-profile.ts.
 */

import type { GarmentSide } from "./types"
import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

export type PrintMethod = "print" | "embroidery"

export type PrintProfileArea = {
  key: string
  label: string
  methods: PrintMethod[]
  sizes: ScpPrintSizeId[]
  max_prints?: number
}

export type ResolvedPrintProfile = {
  /** Profile handle, "custom" for an inline override, or null. */
  handle: string | null
  areas: PrintProfileArea[]
}

/** Apparel sides the customizer canvas can render today (Phase 1). */
const KNOWN_SIDES: GarmentSide[] = [
  "front",
  "back",
  "left_sleeve",
  "right_sleeve",
  "printed_tag",
]

const isKnownSide = (key: string): key is GarmentSide =>
  (KNOWN_SIDES as string[]).includes(key)

/** Sides the profile enables, in canonical order, limited to renderable sides. */
export function profileAllowedSides(
  profile: ResolvedPrintProfile | null | undefined
): GarmentSide[] {
  if (!profile?.areas?.length) return []
  const enabled = new Set(
    profile.areas.map((a) => a.key).filter(isKnownSide) as GarmentSide[]
  )
  // Preserve canonical ordering rather than profile authoring order.
  return KNOWN_SIDES.filter((s) => enabled.has(s))
}

export function profileAreaForSide(
  profile: ResolvedPrintProfile | null | undefined,
  side: GarmentSide
): PrintProfileArea | undefined {
  return profile?.areas?.find((a) => a.key === side)
}

export function profileMethodsForSide(
  profile: ResolvedPrintProfile | null | undefined,
  side: GarmentSide
): PrintMethod[] {
  const m = profileAreaForSide(profile, side)?.methods
  return Array.isArray(m) && m.length ? m : []
}

export function profileSizesForSide(
  profile: ResolvedPrintProfile | null | undefined,
  side: GarmentSide
): ScpPrintSizeId[] {
  const s = profileAreaForSide(profile, side)?.sizes
  return Array.isArray(s) && s.length ? s : []
}

export function profileMaxPrintsForSide(
  profile: ResolvedPrintProfile | null | undefined,
  side: GarmentSide
): number | undefined {
  return profileAreaForSide(profile, side)?.max_prints
}

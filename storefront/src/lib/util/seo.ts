import { getBaseURL } from "./env"

export const SEO = {
  siteName: "SC PRINTS",
  siteDescription:
    "Premium custom apparel, transfers, embroidery, and branding solutions for Australian businesses and teams.",
  contactEmail: "info@scprints.com.au",
  contactPhone: "+61404776649",
  locale: "en_AU",
  country: "AU",
  ogImage: "/branding/sc-prints-logo-transparent.png",
}

/**
 * Physical studio details — the "NAP" (name, address, phone) that local SEO
 * runs on. These MUST match the Google Business Profile character for
 * character; Google cross-checks the listing against on-site markup and
 * inconsistent NAP suppresses local pack ranking.
 *
 * Single source of truth so the LocalBusiness schema on every suburb page,
 * the contact page and the footer can never drift apart.
 */
export const STUDIO = {
  legalName: "SC Prints",
  streetAddress: "7 Epic Place",
  suburb: "Villawood",
  state: "NSW",
  postcode: "2163",
  country: "AU",
  /** Google Business Profile categorises us here. */
  gbpCategory: "Screen printer",
  // Exact pin from the Google Business Profile (maps place /g/11q2xtqvg8).
  latitude: -33.8791765,
  longitude: 150.9925359,
  openingHours: "Mo-Fr 09:00-16:00",
} as const

export const buildAbsoluteUrl = (path = "/") => new URL(path, getBaseURL()).toString()

/**
 * Build a search-snippet-safe meta description from arbitrary copy: strip HTML
 * tags, collapse whitespace, and truncate to ~155 chars on a word boundary.
 * Falls back to `fallback` when there's no usable text.
 * ponytail: 155 = Google SERP snippet sweet spot; bump if Google widens it.
 */
export const metaDescription = (
  text?: string | null,
  fallback: string = SEO.siteDescription
): string => {
  const clean = String(text ?? "")
    .replace(/<[^>]*>/g, " ") // strip HTML tags (supplier imports sometimes embed them)
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return fallback
  if (clean.length <= 155) return clean
  const cut = clean.slice(0, 155)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

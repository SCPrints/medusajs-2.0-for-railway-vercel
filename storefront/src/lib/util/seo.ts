import { getBaseURL } from "./env"

export const SEO = {
  siteName: "SC PRINTS",
  siteDescription:
    "Premium custom apparel, transfers, embroidery, and branding solutions for Australian businesses and teams.",
  contactEmail: "info@scprints.com.au",
  contactPhone: "+61390000000",
  locale: "en_AU",
  country: "AU",
  ogImage: "/branding/sc-prints-logo-transparent.png",
}

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

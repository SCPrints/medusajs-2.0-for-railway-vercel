// Dependency-free: imported by the admin bundle as well as the server.

/**
 * Industry tags staff pick as chips in admin. Must equal the storefront's
 * industry slugs (storefront/src/modules/industries/data/industries.ts) — the
 * industry page filters jobs by its own slug.
 */
export const LOOKBOOK_INDUSTRY_TAGS = [
  "trades",
  "events",
  "hospitality",
  "corporate",
  "sports",
  "schools",
] as const

/**
 * "Art Gallery of NSW - Monumental" → "art-gallery-of-nsw-monumental".
 * Mirrors the SQL backfill in Migration20271016000000 exactly — keep in sync.
 */
export const slugifyJob = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

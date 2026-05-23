/**
 * Plain string-case helpers shared by every catalog importer. Lower-cased
 * slugs feed handle construction; title-cased product names land in
 * customer-facing UI when supplier APIs return ALL-CAPS or shouting case.
 *
 * Distinct from `lib/brand-handle.ts:slugifyBrandHandle`, which also strips
 * combining diacritics and translates `&` → "and" for brand-display strings.
 * These are stricter ASCII transforms for handle/product names.
 */

/** Lower-case + collapse non-alphanumeric runs into single dashes. */
export const slugify = (s: string): string =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

/** Capitalise each whitespace-delimited word. Returns "" for null/undefined. */
export const titleCase = (s: string | undefined): string => {
  if (!s) return ""
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
}

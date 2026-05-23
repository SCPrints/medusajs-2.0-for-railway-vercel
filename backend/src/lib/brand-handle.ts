// Combining diacritical marks: U+0300 to U+036F
const COMBINING_DIACRITIC_RE = /[̀-ͯ]/g

export function slugifyBrandHandle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITIC_RE, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function brandValueKey(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Handle prefix → brand handle. Every supplier importer creates products with
 * a brand-prefixed handle (e.g. `as-colour-staple-tee-5001`), so we can
 * rebuild a missing Product↔Brand link by inferring it from the handle.
 *
 * Single source of truth for `relink-supplier-brands` (repair) and
 * `verify-brand-links` (drift detection). Extend when adding a new supplier.
 */
export const SUPPLIER_HANDLE_PREFIX_TO_BRAND: ReadonlyArray<{
  prefix: string
  brandHandle: string
}> = [
  { prefix: "as-colour-", brandHandle: "as-colour" },
  { prefix: "syzmik-", brandHandle: "syzmik" },
  { prefix: "biz-collection-", brandHandle: "biz-collection" },
  { prefix: "biz-care-", brandHandle: "biz-care" },
  { prefix: "biz-corporates-", brandHandle: "biz-corporates" },
  { prefix: "aussie-pacific-", brandHandle: "aussie-pacific" },
]

/**
 * Infer canonical brand label from product handle (longest prefix wins).
 * Keep in sync with backend `HANDLE_PREFIX_BRAND` in backfill-product-brand-metadata.ts.
 */
const HANDLE_PREFIX_BRAND: Array<{ prefix: string; brand: string }> = [
  { prefix: "american-apparel", brand: "American Apparel" },
  { prefix: "biz-collection", brand: "Biz Collection" },
  { prefix: "next-level", brand: "Next Level" },
  { prefix: "stanley-stella", brand: "Stanley/Stella" },
  { prefix: "as-colour", brand: "AS Colour" },
  { prefix: "grace", brand: "Grace Collection" },
  { prefix: "dnc", brand: "DNC Workwear" },
  { prefix: "ramo", brand: "Ramo" },
  { prefix: "gildan", brand: "Gildan" },
  { prefix: "syzmik", brand: "Syzmik" },
  { prefix: "anvil", brand: "Anvil" },
  { prefix: "aussie-pacific", brand: "Aussie Pacific" },
  { prefix: "winning-spirit", brand: "Winning Spirit" },
  { prefix: "stanley", brand: "Stanley/Stella" },
].sort((a, b) => b.prefix.length - a.prefix.length)

export function inferBrandFromHandle(handle: string): string | null {
  const h = handle.trim().toLowerCase()
  for (const { prefix, brand } of HANDLE_PREFIX_BRAND) {
    if (h === prefix || h.startsWith(`${prefix}-`)) {
      return brand
    }
  }
  return null
}

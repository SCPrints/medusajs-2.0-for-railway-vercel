/**
 * Compliance details per garment (origin, fibre, weight, certifications, care,
 * supplier statement). Stored on `product.metadata.compliance`, with a
 * brand-level default on `brand.metadata.compliance`.
 * Mirror of backend/src/lib/compliance.ts (keep in step).
 */
export type Compliance = {
  country_of_origin?: string
  fibre_content?: string
  fabric_weight?: string
  certifications?: string[]
  care?: string
  /** Link to the supplier's statement (https). */
  statement_url?: string
}

export const COMPLIANCE_LIMITS = { short: 120, care: 400, url: 500, certs: 12, cert: 80 } as const

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined
  const t = v.trim().slice(0, max)
  return t || undefined
}

/** Trim, cap and drop empties. Null when nothing is left. */
export function cleanCompliance(input: unknown): Compliance | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const i = input as Record<string, unknown>
  const L = COMPLIANCE_LIMITS
  const url = text(i.statement_url, L.url)
  const certs = (Array.isArray(i.certifications) ? i.certifications : [])
    .map((c) => text(c, L.cert))
    .filter((c): c is string => !!c)
  const out: Compliance = {
    country_of_origin: text(i.country_of_origin, L.short),
    fibre_content: text(i.fibre_content, L.short),
    fabric_weight: text(i.fabric_weight, L.short),
    certifications: certs.length ? [...new Set(certs)].slice(0, L.certs) : undefined,
    care: text(i.care, L.care),
    statement_url: url && /^https?:\/\//i.test(url) ? url : undefined,
  }
  const clean = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Compliance
  return Object.keys(clean).length ? clean : null
}

/** Brand default underneath, product fields on top (a field the product leaves empty falls back). */
export function mergeCompliance(brandDefault: unknown, product: unknown): Compliance | null {
  return cleanCompliance({ ...(cleanCompliance(brandDefault) ?? {}), ...(cleanCompliance(product) ?? {}) })
}

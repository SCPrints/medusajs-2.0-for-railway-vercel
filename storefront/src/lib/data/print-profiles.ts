import { MEDUSA_BACKEND_URL } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"

import type {
  PrintProfileArea,
  ResolvedPrintProfile,
} from "@modules/customizer/lib/print-profile"

type CatalogProfile = {
  id: string
  name: string
  handle: string
  areas: PrintProfileArea[]
}
type CatalogResponse = { print_profiles: CatalogProfile[]; count: number }

const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (publishableKey) h["x-publishable-api-key"] = publishableKey
  return h
}

/**
 * `PRINT_PROFILES_ENABLED=true` flips the customizer from the legacy title/tag
 * inference to the explicit profile read. Kept off until the catalog has been
 * seeded + every product backfilled, mirroring the LISTING_VIA_SEARCH cutover.
 */
export function printProfilesEnabled(): boolean {
  return (
    process.env.PRINT_PROFILES_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_PRINT_PROFILES_ENABLED === "true"
  )
}

/** Cached catalog of print profiles. Small, slow-moving; aggressively cached. */
export async function listPrintProfiles(): Promise<CatalogProfile[]> {
  "use cache"
  cacheTag("print-profiles")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  try {
    const res = await fetch(`${MEDUSA_BACKEND_URL}/store/print-profiles`, {
      headers: headers(),
    })
    if (!res.ok) return []
    const data = (await res.json()) as CatalogResponse
    return data.print_profiles ?? []
  } catch {
    return []
  }
}

const sanitizeAreas = (input: unknown): PrintProfileArea[] => {
  if (!Array.isArray(input)) return []
  const out: PrintProfileArea[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const key = typeof r.key === "string" ? r.key : ""
    const methods = Array.isArray(r.methods) ? (r.methods as any[]).filter((m) => m === "print" || m === "embroidery") : []
    const sizes = Array.isArray(r.sizes) ? (r.sizes as any[]).filter((s) => typeof s === "string") : []
    if (!key || !methods.length || !sizes.length) continue
    out.push({
      key,
      label: typeof r.label === "string" && r.label ? r.label : key,
      methods: methods as PrintProfileArea["methods"],
      sizes: sizes as PrintProfileArea["sizes"],
      ...(typeof r.max_prints === "number" && r.max_prints > 0
        ? { max_prints: Math.floor(r.max_prints) }
        : {}),
    })
  }
  return out
}

/**
 * Resolve the print profile a product should use: an inline `print_config`
 * override wins, else the referenced profile by handle, else null (caller falls
 * back to the legacy heuristic). Returns null when the feature flag is off so
 * the customizer stays on the legacy path until cutover.
 */
export function resolvePrintProfileForProduct(
  product: Pick<HttpTypes.StoreProduct, "metadata"> | null | undefined,
  catalog: CatalogProfile[]
): ResolvedPrintProfile | null {
  if (!printProfilesEnabled()) return null
  const meta = (product?.metadata ?? {}) as Record<string, unknown>

  const inline = sanitizeAreas(meta.print_config)
  if (inline.length) {
    return { handle: "custom", areas: inline }
  }

  const handle = typeof meta.print_profile === "string" ? meta.print_profile : null
  if (handle && handle !== "custom") {
    const match = catalog.find((p) => p.handle === handle)
    if (match) return { handle, areas: sanitizeAreas(match.areas) }
  }
  return null
}

/** Convenience: fetch the catalog and resolve in one call (server components). */
export async function getPrintProfileForProduct(
  product: Pick<HttpTypes.StoreProduct, "metadata"> | null | undefined
): Promise<ResolvedPrintProfile | null> {
  if (!printProfilesEnabled()) return null
  const catalog = await listPrintProfiles()
  return resolvePrintProfileForProduct(product, catalog)
}

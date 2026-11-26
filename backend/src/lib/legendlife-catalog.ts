/**
 * Legend Life (Epicentre Trading) REST API — client + pure mapping.
 *
 * One API serves 15 brands (Stormtech, Legend, Atlantis, Stedman, James
 * Harvest, …). `/products` is the public catalogue (838 styles, Nov 2026),
 * `/customer/stylePricingAndStock` is SC Prints' trade price + stock per style.
 * Docs: https://api.legendlife.com.au (Swagger) and
 * github.com/room40coding/legendlife-api-docs. Auth: `LEGENDLIFE_API_TOKEN`
 * (Bearer, generated in the Legend Life account → API Data Feed).
 *
 * Quirks (checked against the live API 2026-11-26):
 *   - Pricing `qtyN` is the TOP of band N ("19" = 1–19, 9999997 = no limit).
 *     Price 1 (the smallest band) is the cost we feed the ladder.
 *   - Stock levels are strings, capped: "500+", "1000+". The per-SKU "Total"
 *     location is BNE + MEL + brand-direct, excluding "On Order".
 *   - Style-level `sizesAvailable` is always ["No size"]; sizes live on SKUs.
 *   - One flat front photo per SKU (filename carries the colour CODE, not the
 *     name) and no back photos at all; base/alt images are model shots.
 *   - Their Cloudflare 403s Python's default user agent; Node fetch is fine.
 */

export const LEGENDLIFE_SOURCE = "legendlife"
export const LEGENDLIFE_LOCATION_NAME = "Legend Life Warehouse"
const BASE_URL = (process.env.LEGENDLIFE_BASE_URL ?? "https://api.legendlife.com.au/v1").replace(/\/$/, "")

export type LegendLifeSku = {
  sku: string
  colours: string[]
  sizes: string[]
  image: string[]
}

export type LegendLifeProduct = {
  styleCode: string
  name: string
  shortDescription: string | null
  description: string | null
  class: string
  brands: string[]
  genders: string[]
  fabricTypes: string[]
  categorisation: string[]
  specifications: string[]
  cartonSpecifications: string[]
  images: { baseImage: string[]; altImages: string[] }
  url: string | null
  skus: LegendLifeSku[]
}

export type LegendLifePricingAndStock = {
  styleCode: string
  rrpPrice: number | null
  pricing: Record<string, number | null | undefined>
  stock: Array<{ sku: string; locations: Array<{ name: string; stockLevel: string }> }>
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function legendLifeToken(): string | null {
  return process.env.LEGENDLIFE_API_TOKEN?.trim() || null
}

async function get<T>(path: string, token: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(40_000),
      })
      if (res.status === 401) throw new Error("Legend Life API 401 — LEGENDLIFE_API_TOKEN missing or expired")
      if (!res.ok) throw new Error(`Legend Life API ${res.status} on ${path}`)
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
      if (String((err as Error)?.message).includes("401")) break
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  throw lastErr
}

export async function fetchAllLegendLifeProducts(token: string): Promise<LegendLifeProduct[]> {
  const out: LegendLifeProduct[] = []
  for (let page = 1; ; page++) {
    const res = await get<{ data: LegendLifeProduct[]; lastPage: number }>(
      `/products?page=${page}&pageSize=100`,
      token
    )
    out.push(...res.data)
    if (page >= res.lastPage || !res.data.length) break
  }
  return out
}

export async function fetchLegendLifePricingAndStock(
  styleCode: string,
  token: string
): Promise<LegendLifePricingAndStock> {
  const res = await get<{ data: LegendLifePricingAndStock }>(
    `/customer/stylePricingAndStock?styleCode=${encodeURIComponent(styleCode)}`,
    token
  )
  return res.data
}

/** Run `fn` over `items` with at most `n` in flight (the API is per style). */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

// ---------------------------------------------------------------------------
// Pure mapping
// ---------------------------------------------------------------------------

/** "500+" / "1000+" / "12" / "Mid December" → integer (0 when no digits). */
export function parseStockLevel(raw: unknown): number {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "")
  return digits ? Number.parseInt(digits, 10) : 0
}

/** SKU → available qty, from the per-SKU "Total" location. */
export function stockBySkuFrom(ps: Pick<LegendLifePricingAndStock, "stock">): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of ps.stock ?? []) {
    const total = row.locations?.find((l) => l.name === "Total")
    out.set(row.sku, parseStockLevel(total?.stockLevel))
  }
  return out
}

/** Smallest-quantity trade price (band 1), or null when the style has no price. */
export function costFromPricing(pricing: LegendLifePricingAndStock["pricing"] | null | undefined): number | null {
  const p = Number(pricing?.price1)
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Per-unit grams from "Mass:8kg" + "Carton Quantity:15". */
export function unitWeightGrams(cartonSpecs: string[] | null | undefined): number | null {
  const find = (re: RegExp) => {
    for (const s of cartonSpecs ?? []) {
      const m = s.match(re)
      if (m) return Number.parseFloat(m[1])
    }
    return NaN
  }
  const kg = find(/mass\s*:\s*([\d.]+)\s*kg/i)
  const qty = find(/carton quantity\s*:\s*(\d+)/i)
  if (!(kg > 0) || !(qty > 0)) return null
  return Math.round((kg * 1000) / qty)
}

/** "Black,Granite" → "Black/Granite". */
export const colourLabel = (sku: LegendLifeSku): string =>
  (sku.colours?.[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean).join("/") || "Default"

export const sizeLabel = (sku: LegendLifeSku): string | null => sku.sizes?.[0]?.trim() || null

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

export const brandName = (p: Pick<LegendLifeProduct, "brands">): string => p.brands?.[0]?.trim() || "Legend"
export const brandHandle = (name: string): string => slug(name)

/** `stormtech-mens-crew-softshell-cxj-3` — brand + name + style code, so it never collides. */
export const handleFor = (p: Pick<LegendLifeProduct, "brands" | "name" | "styleCode">): string =>
  [brandHandle(brandName(p)), slug(p.name), slug(p.styleCode)].filter(Boolean).join("-")

/** Keep supplier casing unless the whole name is shouted ("PET CAP" → "Pet Cap"). */
export function titleFor(p: Pick<LegendLifeProduct, "name" | "styleCode">): string {
  const name = (p.name ?? "").trim() || p.styleCode
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export function descriptionFor(p: LegendLifeProduct): string {
  const body = (p.description ?? p.shortDescription ?? "").trim()
  const specs = (p.specifications ?? []).map((s) => s.trim()).filter(Boolean)
  return [body, specs.length ? specs.map((s) => `• ${s}`).join("\n") : ""].filter(Boolean).join("\n\n")
}

/** One flat front photo per colour (the first SKU of that colour), in SKU order. */
export function frontByColour(p: Pick<LegendLifeProduct, "skus">): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of p.skus ?? []) {
    const c = colourLabel(s)
    const url = s.image?.[0]
    if (url && !out.has(c)) out.set(c, url)
  }
  return out
}

/** Colour fronts first (thumbnail = first colour), then the base + alt model shots. */
export function galleryFor(p: LegendLifeProduct): string[] {
  return [
    ...new Set([...frontByColour(p).values(), ...(p.images?.baseImage ?? []), ...(p.images?.altImages ?? [])]),
  ].filter(Boolean)
}

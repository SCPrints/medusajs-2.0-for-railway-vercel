/**
 * Pure helpers for the customer artwork library
 * (`/store/customers/me/artwork`). No container access — unit-tested.
 */

/**
 * True when `url` points at our public file host (R2 public URL,
 * `MINIO_PUBLIC_URL`). The prefix must end at a path boundary so
 * `https://pub-x.r2.dev.evil.com/…` never passes for `https://pub-x.r2.dev`.
 * With no public base configured (local dev only) any http(s) URL passes,
 * matching the contact-form attachment rule in `api/contact/route.ts`.
 */
export function isOurPublicFileUrl(url: string, publicBase: string | null | undefined): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
  const base = publicBase?.trim().replace(/\/+$/, "")
  if (!base) return true
  return url.startsWith(`${base}/`) && url.length > base.length + 1
}

export type OrderOriginalFile = {
  url: string
  name: string
  mime_type: string
  source_order_id: string
}

/**
 * Flatten `customizerDesign.customerOriginalFiles[]` fragments pulled from
 * order lines into one entry per URL (first order seen wins — callers pass
 * rows newest order first). Malformed entries are skipped.
 */
export function extractOrderOriginalFiles(
  rows: Array<{ order_id: string; originals: unknown }>
): OrderOriginalFile[] {
  const byUrl = new Map<string, OrderOriginalFile>()
  for (const row of rows) {
    if (!Array.isArray(row.originals)) continue
    for (const f of row.originals) {
      if (!f || typeof f !== "object") continue
      const o = f as { url?: unknown; fileName?: unknown; mimeType?: unknown }
      const url = typeof o.url === "string" ? o.url.trim() : ""
      if (!url || byUrl.has(url) || url.startsWith("data:")) continue
      const name = typeof o.fileName === "string" && o.fileName.trim() ? o.fileName.trim() : "Artwork"
      const mime =
        typeof o.mimeType === "string" && o.mimeType.trim()
          ? o.mimeType.trim()
          : "application/octet-stream"
      byUrl.set(url, {
        url,
        name: name.slice(0, 200),
        mime_type: mime.slice(0, 100),
        source_order_id: row.order_id,
      })
    }
  }
  return [...byUrl.values()]
}

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

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
}

/**
 * Artwork staff approved in a revised proof (`order.metadata.revised_proofs[]
 * .artwork_url`) — the version that was actually printed, so it belongs in the
 * customer's library alongside what they uploaded. Only file types the Studio
 * can place (PNG / JPEG / SVG); one entry per URL, newest order first.
 */
export function extractProofArtwork(
  rows: Array<{ order_id: string; display_id?: number | string | null; proofs: unknown }>
): OrderOriginalFile[] {
  const byUrl = new Map<string, OrderOriginalFile>()
  for (const row of rows) {
    if (!Array.isArray(row.proofs)) continue
    for (const p of row.proofs) {
      const url = typeof (p as any)?.artwork_url === "string" ? (p as any).artwork_url.trim() : ""
      if (!url || byUrl.has(url)) continue
      const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""
      const mime = MIME_BY_EXT[ext]
      if (!mime) continue
      const side = typeof (p as any)?.side === "string" ? (p as any).side.replace(/_/g, " ") : ""
      byUrl.set(url, {
        url,
        name: `Approved artwork${row.display_id ? ` · order #${row.display_id}` : ""}${side ? ` · ${side}` : ""}`,
        mime_type: mime,
        source_order_id: row.order_id,
      })
    }
  }
  return Array.from(byUrl.values())
}

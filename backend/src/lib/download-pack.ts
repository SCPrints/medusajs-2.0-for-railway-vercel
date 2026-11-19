/**
 * What goes in an order's "Download everything" zip, read off the order's
 * lines and metadata. Pure — unit-tested. Only files on our own file host are
 * ever listed: the design payload is written by the browser, so any other URL
 * in it must not be fetched by the server.
 */
import { isOurPublicFileUrl } from "./customer-artwork"

export type PackFile = { path: string; url: string }

export const PACK_MAX_FILES = 60

const SIDE_LABEL: Record<string, string> = {
  front: "front",
  back: "back",
  left_sleeve: "left sleeve",
  right_sleeve: "right sleeve",
  printed_tag: "neck tag",
}
const side = (s: unknown) => (typeof s === "string" && s ? SIDE_LABEL[s] ?? s.replace(/_/g, " ") : "")
const ext = (url: string, fallback: string) => {
  const m = url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)
  return m ? m[1].toLowerCase() : fallback
}

export function collectPackFiles(
  order: { items?: Array<{ title?: string | null; product_title?: string | null; metadata?: Record<string, unknown> | null }> | null; metadata?: Record<string, unknown> | null },
  publicBase: string | null | undefined
): PackFile[] {
  const files: PackFile[] = []
  const seen = new Set<string>()
  const add = (path: string, url: unknown) => {
    if (typeof url !== "string" || !url || seen.has(url) || !isOurPublicFileUrl(url, publicBase)) return
    seen.add(url)
    files.push({ path, url })
  }

  // Proofs staff made come first: they are what was approved and printed.
  const proofs = Array.isArray(order.metadata?.revised_proofs) ? (order.metadata!.revised_proofs as any[]) : []
  for (const p of proofs) {
    const s = side(p?.side)
    add(`Proofs/Proof from SC Prints${s ? ` - ${s}` : ""}.${ext(String(p?.url ?? ""), "jpg")}`, p?.url)
    add(`Artwork/Print-ready artwork${s ? ` - ${s}` : ""}.${ext(String(p?.artwork_url ?? ""), "png")}`, p?.artwork_url)
  }

  for (const item of order.items ?? []) {
    const design = (item?.metadata as any)?.customizerDesign
    if (!design || typeof design !== "object") continue
    const garment = String(item.product_title || item.title || "Garment").replace(/\s*\/\s*[^/]+$/, "")
    for (const a of Array.isArray(design.artifacts) ? design.artifacts : []) {
      const s = side(a?.side)
      add(`Proofs/Mockup - ${garment}${s ? ` - ${s}` : ""}.${ext(String(a?.mockupUrl ?? ""), "png")}`, a?.mockupUrl)
    }
    for (const o of Array.isArray(design.customerOriginalFiles) ? design.customerOriginalFiles : []) {
      const name = typeof o?.fileName === "string" && o.fileName.trim() ? o.fileName.trim() : `artwork.${ext(String(o?.url ?? ""), "png")}`
      add(`Artwork/Your files/${name}`, o?.url)
    }
  }
  return files.slice(0, PACK_MAX_FILES)
}

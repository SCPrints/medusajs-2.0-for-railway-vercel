/**
 * The customer's purchase-order document attached at checkout
 * (`metadata.po_document = { url, name }`, set only by
 * /store/carts/:id/po-document). Pure — admin-safe.
 */
export const PO_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const PO_DOCUMENT_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"])

/** Safe stored name, or null when the type isn't allowed. */
export function poDocumentFileName(raw: string): string | null {
  const base = (String(raw).split(/[\\/]/).pop() || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : ""
  return base && PO_DOCUMENT_EXTENSIONS.has(ext) ? base : null
}

export type PoDocument = { url: string; name: string }

export function poDocumentFromMetadata(meta: unknown): PoDocument | null {
  const d = meta && typeof meta === "object" ? (meta as Record<string, any>).po_document : null
  return d && typeof d.url === "string" && /^https:\/\//.test(d.url) && typeof d.name === "string"
    ? { url: d.url, name: d.name }
    : null
}

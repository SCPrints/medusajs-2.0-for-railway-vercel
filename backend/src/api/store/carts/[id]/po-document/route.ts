import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { metadataPatch } from "../../../../../lib/metadata-patch"
import { PO_DOCUMENT_EXTENSIONS, PO_DOCUMENT_MAX_BYTES, poDocumentFileName } from "../../../../../lib/po-document"

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(150).optional(),
  /** Raw bytes, base64 (no `data:` prefix). */
  dataBase64: z.string().min(1),
})

async function loadOpenCart(req: MedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: String(req.params?.id ?? "") },
    fields: ["id", "completed_at", "metadata"],
  })
  const cart = data?.[0] as { id: string; completed_at?: unknown; metadata?: Record<string, unknown> | null } | undefined
  if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  if (cart.completed_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That cart has already been checked out.")
  return cart
}

/**
 * POST   /store/carts/:id/po-document  { fileName, mimeType?, dataBase64 } → { po_document: { url, name } }
 * DELETE /store/carts/:id/po-document → { po_document: null }
 *
 * The customer's purchase-order document (PDF / image), stored on our bucket
 * and stamped on `cart.metadata.po_document` (copied to the order at
 * checkout). Only this route sets it: the cart update route strips the key,
 * so a forged URL can't reach staff. Cart id is the capability, as on the
 * other cart routes; the browser posts here directly (Vercel's body cap).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a file to attach.")
  const cart = await loadOpenCart(req)
  const name = poDocumentFileName(parsed.data.fileName)
  if (!name) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Attach a ${[...PO_DOCUMENT_EXTENSIONS].join(", ").toUpperCase()} file.`)
  }
  const bytes = Buffer.from(parsed.data.dataBase64, "base64").length
  if (!bytes || bytes > PO_DOCUMENT_MAX_BYTES) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `The file must be under ${PO_DOCUMENT_MAX_BYTES / 1024 / 1024} MB.`)
  }
  const files = req.scope.resolve(Modules.FILE) as any
  const [uploaded] = await files.createFiles([
    { filename: `po-${name}`, mimeType: parsed.data.mimeType || "application/octet-stream", content: parsed.data.dataBase64 },
  ])
  if (!uploaded?.url) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "File storage isn't available. Try again.")
  const po_document = { url: uploaded.url as string, name }
  const cartModule = req.scope.resolve(Modules.CART) as any
  await cartModule.updateCarts(cart.id, { metadata: { ...(cart.metadata ?? {}), po_document } })
  res.json({ po_document })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const cart = await loadOpenCart(req)
  const { po_document: _gone, ...rest } = cart.metadata ?? {}
  const cartModule = req.scope.resolve(Modules.CART) as any
  await cartModule.updateCarts(cart.id, { metadata: metadataPatch(cart.metadata, rest) })
  res.json({ po_document: null })
}

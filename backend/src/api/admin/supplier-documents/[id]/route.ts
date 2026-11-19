import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ADMIN_WORKSPACE_MODULE } from "../../../../modules/admin-workspace"
import type AdminWorkspaceService from "../../../../modules/admin-workspace/service"
import { supplierDocumentSchema } from "../../../../lib/supplier-documents"

/**
 * POST   /admin/supplier-documents/:id  body: { title?, url? } → { document }
 *        (replacing the file = a new url; `updated_at` moves, which is the date customers see)
 * DELETE /admin/supplier-documents/:id → { id, deleted: true }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = supplierDocumentSchema.partial().safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" })
  const service = req.scope.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  try {
    const document = await service.updateSupplierDocuments({ id: req.params.id, ...parsed.data })
    res.json({ document })
  } catch {
    res.status(404).json({ error: "not_found" })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  await service.deleteSupplierDocuments(req.params.id)
  res.json({ id: req.params.id, deleted: true })
}

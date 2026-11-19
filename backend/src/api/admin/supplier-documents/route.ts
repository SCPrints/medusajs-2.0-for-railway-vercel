import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { supplierDocumentSchema } from "../../../lib/supplier-documents"
import { ADMIN_WORKSPACE_MODULE } from "../../../modules/admin-workspace"
import type AdminWorkspaceService from "../../../modules/admin-workspace/service"

/**
 * GET  /admin/supplier-documents → { documents }
 * POST /admin/supplier-documents  body: { title, url } → 201 { document }
 *
 * SC Prints' own documents (ABN certificate, insurance…) that signed-in
 * customers can download from /account/documents. The file itself is uploaded
 * through /admin/uploads first; this stores its title + URL.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  const documents = await service.listSupplierDocuments({}, { order: { title: "ASC" }, take: 200 })
  res.json({ documents })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = supplierDocumentSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" })
  const service = req.scope.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  const document = await service.createSupplierDocuments(parsed.data)
  res.status(201).json({ document })
}

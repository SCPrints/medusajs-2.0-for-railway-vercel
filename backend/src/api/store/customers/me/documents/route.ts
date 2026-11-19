import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireCustomer } from "../../../../../lib/require-customer"
import { ADMIN_WORKSPACE_MODULE } from "../../../../../modules/admin-workspace"
import type AdminWorkspaceService from "../../../../../modules/admin-workspace/service"

/**
 * GET /store/customers/me/documents → { documents: [{ id, title, url, updated_at }] }
 *
 * SC Prints' supplier documents (ABN certificate, insurance…) for any
 * signed-in customer. Staff manage them in admin → Setup → Supplier documents.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  requireCustomer(req)
  const service = req.scope.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  const rows = await service.listSupplierDocuments({}, { order: { title: "ASC" }, take: 200 })
  res.json({
    documents: rows.map((d: any) => ({ id: d.id, title: d.title, url: d.url, updated_at: d.updated_at })),
  })
}

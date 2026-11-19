import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { loadVisibleDesign } from "../../../../../../../lib/owned-design"
import { requireCustomer } from "../../../../../../../lib/require-customer"

/**
 * GET /store/customers/me/designs/:id/versions
 *
 * Lists prior versions of the design, newest first. The "live" design
 * row is the current state — versions are the *historical* snapshots
 * taken at each save.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const designId = req.params.id
  // Read-only: shared designs' history is visible to org members too.
  const { designsService } = await loadVisibleDesign(req.scope, designId, customerId)

  const versions = await designsService.listDesignVersions(
    { design_id: designId },
    { order: { version: "DESC" }, take: 100 }
  )

  res.json({ versions })
}

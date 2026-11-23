import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { BUYER_VISIBLE_STATUSES, isTeamStoresEnabled } from "../../../../lib/team-store"
import { captureEvent } from "../../../../lib/posthog"
import { verifyStorePassword } from "../../../../services/team-store/sign"
import { findStoreByHandle, publicStoreView } from "../../../../services/team-store/storefront"

/**
 * GET /store/team-stores/:handle — the buyer's store page. 404 unless
 * TEAM_STORES_ENABLED and the store has opened at least once. A password
 * store needs `x-team-store-password`; without it → 401 { password_required }.
 * Items only while the store is open.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!isTeamStoresEnabled()) return res.status(404).json({ message: "Not found" })
  const store = await findStoreByHandle(req.scope, req.params.handle)
  if (!store || !BUYER_VISIBLE_STATUSES.has(store.status)) return res.status(404).json({ message: "Not found" })

  const password = req.headers["x-team-store-password"]
  if (store.password_hash && !verifyStorePassword(store.password_hash, Array.isArray(password) ? password[0] : password)) {
    return res.status(401).json({ password_required: true, wrong: !!password, title: store.title })
  }

  const view = await publicStoreView(req.scope, store, { includeItems: store.status === "open" })
  if (view.store.state !== "open") view.items = []
  captureEvent(`team_store_${store.id}`, "team_store_viewed", { team_store_id: store.id, state: view.store.state })
  res.json(view)
}

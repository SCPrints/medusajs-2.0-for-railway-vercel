import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../modules/organisation"
import { TEAM_STORE_MODULE } from "../../../modules/team-store"
import { adminStoreView, parseBody, storeBodySchema, storeFields } from "../../../services/team-store/admin"
import { storeUrl } from "../../../services/team-store/run"

/**
 * GET /admin/team-stores[?quote=<run quote id>] — every store with its
 * organisation name and item count. POST — create a draft store.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const quoteId = typeof req.query.quote === "string" ? req.query.quote : null
  const stores: any[] = await service.listTeamStores(quoteId ? { quote_id: quoteId } : {}, {
    take: 500,
    order: { created_at: "DESC" },
  })
  const [items, orgs] = await Promise.all([
    stores.length ? service.listTeamStoreItems({ team_store_id: stores.map((s) => s.id) }, { take: 5000, select: ["id", "team_store_id"] }) : [],
    stores.length
      ? (req.scope.resolve(ORGANISATION_MODULE) as any).listOrganisations({ id: [...new Set(stores.map((s) => s.organisation_id))] }, { take: 500, select: ["id", "name"] })
      : [],
  ])
  const orgName = new Map((orgs as any[]).map((o) => [o.id, o.name]))
  const count = new Map<string, number>()
  for (const i of items as any[]) count.set(i.team_store_id, (count.get(i.team_store_id) ?? 0) + 1)
  res.json({
    team_stores: stores.map(({ password_hash, ...s }) => ({
      ...s,
      has_password: !!password_hash,
      organisation_name: orgName.get(s.organisation_id) ?? null,
      item_count: count.get(s.id) ?? 0,
      url: storeUrl(s.handle),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseBody(storeBodySchema, req.body)
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const fields = await storeFields(req.scope, body)
  const store = await service.createTeamStores({ ...fields, status: "draft" })
  res.status(201).json(await adminStoreView(req.scope, store.id))
}

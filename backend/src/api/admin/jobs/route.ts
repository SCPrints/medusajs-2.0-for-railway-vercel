import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { Modules } from "@medusajs/framework/utils"

import { buildToday } from "../../../services/jobs/today"

/**
 * GET /admin/jobs[?fresh=1] — the Today list (lib/job-today.ts): every
 * unfinished job in three sections, longest wait first. Cached 60 s.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const fresh = String(req.query?.fresh ?? "") === "1"
    // `me` lets the list show "Mine" and greet you without another round trip (the view itself is shared/cached).
    const me: string | null = (req as any).auth_context?.actor_id ?? null
    const user = me ? await (req.scope.resolve(Modules.USER) as any).retrieveUser(me).catch(() => null) : null
    return res.json({ ...(await buildToday(req.scope, { fresh })), me, me_name: user?.first_name ?? null })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "failed to build today" })
  }
}

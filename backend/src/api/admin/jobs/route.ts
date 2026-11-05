import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { buildToday } from "../../../services/jobs/today"

/**
 * GET /admin/jobs[?fresh=1] — the Today list (lib/job-today.ts): every
 * unfinished job in three sections, longest wait first. Cached 60 s.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const fresh = String(req.query?.fresh ?? "") === "1"
    // `me` lets the list show "Mine" without another round trip (the view itself is shared/cached).
    return res.json({ ...(await buildToday(req.scope, { fresh })), me: (req as any).auth_context?.actor_id ?? null })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "failed to build today" })
  }
}

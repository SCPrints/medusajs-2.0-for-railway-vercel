import { revalidateTag } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

import { ALL_ORG_TAGS_FOR } from "@lib/util/org-cache-tags"
import { safeEqual } from "@lib/util/api-guard"

/**
 * On-demand cache purge for per-organisation tag-based caches
 * (Phase 2 fulfillment portal — see Docs/FULFILLMENT_PHASE_2_SPEC.md).
 *
 * Backend admin routes POST here when they mutate an org's designs,
 * destinations, or inventory; the storefront's tagged fetchers then
 * see fresh data on the next render without a per-request DB hit.
 *
 *   curl -X POST "https://<storefront>/api/revalidate-org" \
 *     -H "Authorization: Bearer <REVALIDATE_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"organisation_id":"org_xxx","tags":["org:org_xxx:designs"]}'
 *
 * Body options:
 *   - { organisation_id: "..." } — purges ALL tags for that org (the
 *     common case for "something changed for org X")
 *   - { organisation_id: "...", tags: [...] } — purges only the listed
 *     tags (must all be prefixed with `org:<id>:` to scope the call)
 *   - { tags: [...] } — explicit tag list, no org_id needed. All must
 *     start with `org:`.
 */

const MAX_TAGS_PER_REQUEST = 50

function parseInput(
  body: unknown
): { orgId?: string; tags?: string[] } | null {
  if (!body || typeof body !== "object") return null
  const orgId = (body as { organisation_id?: unknown }).organisation_id
  const raw = (body as { tags?: unknown }).tags
  const tags = Array.isArray(raw)
    ? raw
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
        .filter((t) => t.startsWith("org:"))
        .slice(0, MAX_TAGS_PER_REQUEST)
    : undefined
  return {
    orgId: typeof orgId === "string" && orgId.length > 0 ? orgId : undefined,
    tags,
  }
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected?.trim()) {
    return NextResponse.json(
      { message: "REVALIDATE_SECRET is not set on the storefront" },
      { status: 503 }
    )
  }

  // Header-only: a `?secret=` query param leaks into access logs, proxies,
  // Referer headers and browser history — so we no longer accept it.
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    ?.trim()

  if (!bearer || !safeEqual(bearer, expected)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    /* no body */
  }

  const parsed = parseInput(body)
  if (!parsed || (!parsed.orgId && !parsed.tags?.length)) {
    return NextResponse.json(
      { message: "organisation_id or tags required" },
      { status: 400 }
    )
  }

  // Resolve the tag list:
  //  - explicit tags win
  //  - otherwise, expand org_id to all per-org tags
  const tags = parsed.tags?.length
    ? parsed.tags
    : ALL_ORG_TAGS_FOR(parsed.orgId!)

  for (const tag of tags) {
    revalidateTag(tag, "max")
  }

  return NextResponse.json({ revalidated: true, tags })
}

import "server-only"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

/**
 * Pass a backend file download (PDF / CSV / zip) through the storefront, so a
 * plain link can download it: the customer's sign-in cookie is httpOnly and
 * only the Next runtime can read it. The body is streamed, not buffered.
 */
export async function proxyDownload(
  backendPath: string,
  opts: { method?: "GET" | "POST"; headers?: Record<string, string>; failMessage: string }
): Promise<Response> {
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const upstream = await fetch(`${MEDUSA_BACKEND_URL}${backendPath}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(key ? { "x-publishable-api-key": key } : {}),
      ...(await getAuthHeaders()),
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.json().catch(() => null)) as { message?: string } | null
    return new Response(detail?.message || opts.failMessage, {
      status: upstream.status === 401 ? 401 : upstream.status >= 400 ? upstream.status : 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    })
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": upstream.headers.get("content-disposition") ?? "attachment",
      "cache-control": "no-store",
    },
  })
}

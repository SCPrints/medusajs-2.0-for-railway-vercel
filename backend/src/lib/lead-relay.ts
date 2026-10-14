import { createHash, timingSafeEqual } from "node:crypto"

// Hash both sides so lengths match and nothing leaks via timing.
const safeEqualStrings = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())

/**
 * Lead-capture routes (contact form, quote requests) are public and email
 * staff, so scripts were posting straight at the backend. The storefront's
 * Vercel relays now prove they're us with `x-scp-relay: <REVALIDATE_SECRET>`
 * (already shared by both apps for cache purges) and forward what the backend
 * can't otherwise see: the visitor's real IP / user agent, and Vercel BotID's
 * verdict (`x-scp-bot: 1` — flagged, not blocked, so AI shopping agents with a
 * real cart still reach staff).
 *
 * Unset secret = not enforced (local dev).
 */
export type LeadRelay = { ok: boolean; clientIp: string | null; userAgent: string | null; bot: boolean }

const header = (req: any, name: string): string | null => {
  const v = req.headers?.[name]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === "string" && s.trim() ? s.trim().slice(0, 300) : null
}

export function readLeadRelay(req: any): LeadRelay {
  const secret = process.env.REVALIDATE_SECRET?.trim()
  const sent = header(req, "x-scp-relay")
  const ok = !secret || (!!sent && safeEqualStrings(sent, secret))
  const forwardedFor = header(req, "x-forwarded-for")?.split(",")[0]?.trim() ?? null
  return {
    ok,
    clientIp: (ok && header(req, "x-scp-client-ip")) || forwardedFor,
    userAgent: (ok && header(req, "x-scp-client-ua")) || header(req, "user-agent"),
    bot: ok && header(req, "x-scp-bot") === "1",
  }
}

export const LEAD_RELAY_REJECTED = {
  success: false,
  message: "Please use the form on scprints.com.au to contact us.",
}

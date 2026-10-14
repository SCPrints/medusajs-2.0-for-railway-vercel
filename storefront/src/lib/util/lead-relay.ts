import { checkBotId } from "botid/server"
import { headers as nextHeaders } from "next/headers"

import { HONEYPOT_FIELD } from "@modules/common/components/honeypot-field"

/**
 * Headers for relaying a lead form (contact / quote) to the backend. The
 * backend only accepts these routes from our relays (see backend
 * lib/lead-relay.ts): `x-scp-relay` proves it's us, and we forward what the
 * backend can't see — the visitor's real IP / user agent and BotID's verdict.
 * A bot verdict FLAGS the enquiry for staff rather than blocking it, so AI
 * shopping agents acting for real customers still get through.
 */
export async function leadRelayHeaders({ botCheck = true } = {}): Promise<Record<string, string>> {
  const h = await nextHeaders()
  const out: Record<string, string> = {}
  const secret = process.env.REVALIDATE_SECRET?.trim()
  if (secret) out["x-scp-relay"] = secret
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim()
  if (ip) out["x-scp-client-ip"] = ip
  const ua = h.get("user-agent")?.trim()
  if (ua) out["x-scp-client-ua"] = ua.slice(0, 300)
  // Only paths listed in instrumentation-client.ts carry a BotID token —
  // checking anything else would flag every real visitor.
  if (botCheck) try {
    if ((await checkBotId()).isBot) out["x-scp-bot"] = "1"
  } catch {
    // BotID unavailable (local dev, outage) — don't flag, don't block.
  }
  return out
}

/** Hidden form field real people never see. Filled = bot: pretend success, send nothing. */
export const isHoneypotTripped = (payload: unknown) => {
  const v = (payload as Record<string, unknown> | null)?.[HONEYPOT_FIELD]
  return typeof v === "string" && v.trim().length > 0
}

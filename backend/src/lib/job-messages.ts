/**
 * Customer <-> staff messages on an order job (customer portal #38).
 * Pure: no container access. The thread is a view over order comments.
 */

/** created_by of a message the customer typed on the order page. Starts "email:" so the job diary files it as the customer's email (waiting-on-us logic unchanged). */
export const PORTAL_MESSAGE_ACTOR_PREFIX = "email:portal:"
/** created_by of a problem / size-swap request. Deliberately NOT "email:" (not a message), and never shown in the thread. */
export const PORTAL_REQUEST_ACTOR_PREFIX = "portal-request:"
const STAFF_EMAIL_PREFIX = "staff-email:"

export type CommentRow = { id: string; body: string | null; created_by: string | null; created_at: Date | string }
export type ThreadMessage = { id: string; at: string; from: "you" | "staff"; text: string }

const bare = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase()

/** Comment body for a portal message, in the same shape as an inbound email. */
export const portalMessageBody = (email: string | null, text: string) =>
  `From: ${email ?? "customer"} · Subject: Message from the order page\n\n${text.trim()}`

/** Drops the "From: … · Subject: …" header line the inbound path adds. */
export function stripMessageHeader(body: string): string {
  const m = body.match(/^From: [^\n]*\n\n([\s\S]*)$/)
  return (m ? m[1] : body).trim()
}

/**
 * What the customer may see: only comments THEY wrote (portal messages, or an
 * email from their own address) and emails staff SENT to them. Everything else
 * (internal notes "staff-note:", system rows, other senders, anything unknown)
 * is dropped by default.
 */
export function visibleMessages(
  rows: CommentRow[],
  who: { customerId: string; customerEmail: string | null }
): ThreadMessage[] {
  const mine = who.customerEmail?.trim().toLowerCase() || null
  const out: ThreadMessage[] = []
  for (const r of rows) {
    const by = r.created_by ?? ""
    let from: ThreadMessage["from"] | null = null
    if (by === `${PORTAL_MESSAGE_ACTOR_PREFIX}${who.customerId}`) from = "you"
    else if (by.startsWith(STAFF_EMAIL_PREFIX)) from = "staff"
    else if (by.startsWith("email:") && !by.startsWith(PORTAL_MESSAGE_ACTOR_PREFIX) && mine && bare(by.slice(6)) === mine) from = "you"
    if (!from) continue
    const text = stripMessageHeader(String(r.body ?? ""))
    if (!text) continue
    out.push({ id: r.id, at: new Date(r.created_at).toISOString(), from, text })
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1))
}

import { ORDER_INBOX_DOMAIN, SUPPORT_REPLY_TO_EMAIL } from "./constants"

/**
 * Per-job Reply-To addresses. When ORDER_INBOX_DOMAIN is set, customer
 * emails about an order carry `inbox+ord<id>@${domain}` and emails about a
 * quote carry `inbox+qt<id>@${domain}`, so a reply lands on the inbound
 * webhook (/hooks/resend `email.received`, or the generic
 * /hooks/inbound-email) and is written to that job's activity instead of
 * disappearing into Outlook. Falls back to SUPPORT_REPLY_TO_EMAIL when unset.
 *
 * The short id (last 12 chars of the ULID) keeps the alias readable; the
 * webhook suffix-matches it. Anyone holding an alias can post to that job,
 * which is the same trust level as the signed links we already email.
 */
export type InboxKind = "order" | "quote"

const PREFIX: Record<InboxKind, string> = { order: "ord", quote: "qt" }

export function jobInboxAddress(kind: InboxKind, id: string): string | undefined {
  if (!ORDER_INBOX_DOMAIN) return SUPPORT_REPLY_TO_EMAIL
  return `inbox+${PREFIX[kind]}${id.slice(-12)}@${ORDER_INBOX_DOMAIN}`
}

export const orderInboxAddress = (orderId: string) => jobInboxAddress("order", orderId)
export const quoteInboxAddress = (quoteId: string) => jobInboxAddress("quote", quoteId)

/**
 * Parses an inbox alias (optionally in `Name <addr>` form) back to the job
 * kind + short-id suffix. Null when the address isn't ours.
 */
export function parseInboxAlias(
  toAddress: string
): { kind: InboxKind; suffix: string } | null {
  if (typeof toAddress !== "string") return null
  const match = toAddress.toLowerCase().match(/inbox\+(ord|qt)([a-z0-9]{12})@/)
  if (!match) return null
  return { kind: match[1] === "qt" ? "quote" : "order", suffix: match[2] }
}

/** @deprecated use parseInboxAlias — kept for the generic inbound route. */
export function parseOrderInboxAlias(toAddress: string): string | null {
  const parsed = parseInboxAlias(toAddress)
  return parsed?.kind === "order" ? parsed.suffix : null
}

/**
 * Drops the quoted thread below a reply ("On … wrote:", "From: …" header
 * blocks, "-----Original Message-----") so the activity entry is the new
 * text only. ponytail: three common markers; the full email is still in
 * Resend if a quote is cut wrongly.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const cut = lines.findIndex(
    (l) =>
      /^\s*On .{3,200} wrote:\s*$/.test(l) ||
      /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i.test(l) ||
      (/^\s*From:\s.+/.test(l) && lines.slice(lines.indexOf(l) + 1, lines.indexOf(l) + 4).some((n) => /^\s*(Sent|Date|To):\s/.test(n)))
  )
  const kept = cut === -1 ? lines : lines.slice(0, cut)
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

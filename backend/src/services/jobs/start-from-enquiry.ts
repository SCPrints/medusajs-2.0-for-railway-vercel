import type { MedusaContainer } from "@medusajs/framework/types"
import { ulid } from "ulid"

import { ADMIN_PUBLIC_URL, BACKEND_URL } from "../../lib/constants"
import { QUOTE_MODULE } from "../../modules/quote"
import { bustTodayCache } from "./today"

export type EnquiryInput = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email: string
  phone?: string | null
  subject?: string | null
  message: string
  attachments?: { url?: string | null }[] | null
  created_at?: string | Date | null
  /** The storefront's bot check flagged it: shown as "Possible bot" in New. */
  bot?: boolean
}

/**
 * Turns a contact-form enquiry into a job: a `new` quote carrying the
 * sender's details, their message and attachments (as the mood board), so it
 * lands in the Jobs list's New folder. Called by the contact form itself and
 * by the "Start job" route for older enquiries. Idempotent per submission.
 */
export async function startJobFromEnquiry(
  container: MedusaContainer,
  s: EnquiryInput,
  actor = "contact_form"
): Promise<{ quote_id: string; public_id: string; existed: boolean }> {
  const quotes = container.resolve(QUOTE_MODULE) as any

  // ponytail: jsonb filters on the module aren't reliable; scan the newest
  // quotes instead (a few hundred at most). Any source: staff have started
  // jobs from enquiries as admin quotes, which carry the submission id too.
  const recent: any[] = await quotes
    .listQuotes({}, { take: 500, order: { created_at: "DESC" }, select: ["id", "public_id", "metadata"] })
    .catch(() => [])
  const existing = recent.find((q) => q?.metadata?.contact_submission_id === s.id)
  if (existing?.id) return { quote_id: existing.id, public_id: existing.public_id, existed: true }

  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || null
  const attachments = (s.attachments ?? []).map((a) => a?.url).filter((u): u is string => !!u)
  const receivedAt = s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString()

  const [quote] = await quotes.createQuotes([
    {
      public_id: publicId,
      status: "new",
      source: "contact",
      email: s.email,
      contact_name: name,
      contact_phone: s.phone ?? null,
      subject: s.subject ?? null,
      message: s.message,
      line_items: { items: [] },
      metadata: {
        contact_submission_id: s.id,
        enquiry_received_at: receivedAt,
        ...(attachments.length ? { mood_board_urls: attachments } : {}),
        ...(s.bot ? { bot_flagged: true } : {}),
      },
    },
  ])
  await quotes.createQuoteEvents([
    { quote_id: quote.id, type: "created", actor, body: { source: "contact", public_id: publicId, contact_submission_id: s.id } },
  ])
  bustTodayCache()
  return { quote_id: quote.id, public_id: publicId, existed: false }
}

/** Absolute admin link to a job, for staff emails. */
export const adminJobUrl = (id: string): string | null => {
  const root = (ADMIN_PUBLIC_URL ?? BACKEND_URL ?? "").replace(/\/$/, "")
  return root ? `${root}/app/jobs/${encodeURIComponent(id)}` : null
}

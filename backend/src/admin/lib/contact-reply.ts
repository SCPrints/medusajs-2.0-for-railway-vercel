export type ContactReplyAttachment = {
  fileName: string
}

export type ContactReplySubmission = {
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  subject: string | null
  message: string
  created_at: string
  attachments: ContactReplyAttachment[] | null
}

// Mail clients truncate (or refuse) very long mailto: URLs. Percent-encoding
// inflates the body unpredictably (every newline and space triples), so budget
// against the ENCODED url rather than a raw character count — measured against
// real submissions, a fixed message cap overshoots on chatty enquiries.
export const MAX_MAILTO_URL = 1800
const MAX_QUOTED_MESSAGE = 900
const MIN_QUOTED_MESSAGE = 150
const TRIM_STEP = 150

export const contactFullName = (s: ContactReplySubmission) =>
  [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "—"

export function buildReplyBody(s: ContactReplySubmission, messageLimit: number) {
  const received = new Date(s.created_at).toLocaleString()
  const message =
    s.message.length > messageLimit
      ? `${s.message.slice(0, messageLimit)}…\n[trimmed — full message is in the admin]`
      : s.message
  const attachments = s.attachments ?? []

  const lines = [
    `Hi ${s.first_name?.trim() || "there"},`,
    "",
    "",
    "",
    `--- Your enquiry via scprints.com.au, ${received} ---`,
    `From: ${contactFullName(s)} <${s.email}>`,
  ]

  if (s.phone) lines.push(`Phone: ${s.phone}`)
  if (s.subject) lines.push(`Subject: ${s.subject}`)

  lines.push("", message)

  // Filenames only — the customer sent these, so echoing our storage URLs back
  // at them is noise, and the URLs are what blew the mailto: length budget.
  if (attachments.length) {
    lines.push("", `You attached: ${attachments.map((a) => a.fileName).join(", ")}`)
  }

  return lines.join("\n")
}

export function buildMailtoUrl(s: ContactReplySubmission) {
  const subject = s.subject ? `Re: ${s.subject}` : "Re: your enquiry — SC Prints"
  const urlFor = (messageLimit: number) =>
    `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(buildReplyBody(s, messageLimit))}`

  let limit = MAX_QUOTED_MESSAGE
  let url = urlFor(limit)
  while (url.length > MAX_MAILTO_URL && limit > MIN_QUOTED_MESSAGE) {
    limit -= TRIM_STEP
    url = urlFor(limit)
  }
  return url
}

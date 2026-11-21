import { Section, Text, Button } from "react-email"

import { Base, STYLES, NAVY } from "./base"

export const JOB_ATTENTION = "job-attention"

export type JobAttentionKind =
  | "customer_reply"
  | "accepted_no_order"
  | "changes_requested"
  | "names_numbers_requested"
  | "problem_reported"
  | "size_swap_requested"

/** Email-only kinds: no task, so not part of raiseAttention's JobAttentionKind. */
type AlertKind = JobAttentionKind | "unmatched_email"

export interface JobAttentionProps {
  alert: {
    kind: AlertKind
    /** "#114" or "Q-4GY0KD74V2". */
    label: string
    from: string | null
    subject: string | null
    excerpt: string | null
    jobUrl: string | null
  }
  preview?: string
}

export const isJobAttentionData = (data: any): data is JobAttentionProps =>
  typeof data?.alert === "object" &&
  typeof data?.alert?.kind === "string" &&
  typeof data?.alert?.label === "string"

const COPY: Record<AlertKind, { eyebrow: string; color: string; body: string }> = {
  unmatched_email: {
    eyebrow: "Email we couldn't match to a job",
    color: "#dc2626",
    body: "This came in on a job email address that doesn't match any job, so it isn't on a job. Reply to this email to answer the sender directly.",
  },
  customer_reply: {
    eyebrow: "Customer waiting on you",
    color: "#dc2626",
    body: "The customer emailed about this job. It's on the job's Activity and a task is in your queue.",
  },
  accepted_no_order: {
    eyebrow: "Accepted, no order",
    color: "#dc2626",
    body: "The customer accepted this quote but it was never converted. Convert it to an order and send the payment link.",
  },
  changes_requested: {
    eyebrow: "Proof changes requested",
    color: "#f97316",
    body: "The customer asked for changes on their proof. Revise the artwork and re-send it.",
  },
  names_numbers_requested: {
    eyebrow: "Names / numbers to price",
    color: "#f97316",
    body: "The customer asked for names or numbers printed on the garments. No price was charged for them. The roster is in the job's Delivery section: price it, confirm with the customer, then go ahead.",
  },
  problem_reported: {
    eyebrow: "Customer reported a problem",
    color: "#dc2626",
    body: "The customer reported a problem with their order. Photos and details are on the job's Activity. Decide it under Customer requests, then reply to them.",
  },
  size_swap_requested: {
    eyebrow: "Size swap requested",
    color: "#f97316",
    body: "The customer asked to swap a size. Check stock (printed garments usually can't be swapped), decide it under Customer requests, then reply to them.",
  },
}

export const JobAttentionEmail = ({ alert, preview }: JobAttentionProps) => {
  const copy = COPY[alert.kind] ?? COPY.customer_reply
  return (
    <Base preview={preview ?? `${copy.eyebrow}: ${alert.label}`}>
      <Text style={STYLES.eyebrow}>{copy.eyebrow}</Text>
      <Text style={{ ...STYLES.h1, color: copy.color }}>{alert.label}</Text>
      <Text style={STYLES.body}>{copy.body}</Text>

      {alert.from || alert.subject || alert.excerpt ? (
        <Section
          style={{
            background: "#f9fafb",
            padding: "12px 16px",
            borderRadius: "8px",
            margin: "16px 0 0",
          }}
        >
          {alert.from ? (
            <Text style={{ ...STYLES.meta, margin: 0 }}>
              <strong style={{ color: NAVY }}>From:</strong> {alert.from}
            </Text>
          ) : null}
          {alert.subject ? (
            <Text style={{ ...STYLES.meta, margin: "4px 0 0" }}>
              <strong style={{ color: NAVY }}>Subject:</strong> {alert.subject}
            </Text>
          ) : null}
          {alert.excerpt ? (
            <Text style={{ ...STYLES.body, margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
              {alert.excerpt}
            </Text>
          ) : null}
        </Section>
      ) : null}

      {alert.jobUrl ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Button href={alert.jobUrl} style={STYLES.buttonPrimary}>
            Open the job &rarr;
          </Button>
        </Section>
      ) : null}
    </Base>
  )
}

export default JobAttentionEmail

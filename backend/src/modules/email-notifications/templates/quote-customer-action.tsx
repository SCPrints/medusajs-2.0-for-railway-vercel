import { Section, Text, Button } from "@react-email/components"

import { Base, STYLES, NAVY } from "./base"

export const QUOTE_CUSTOMER_ACTION = "quote-customer-action"

export type QuoteCustomerActionKind =
  | "design_approved"
  | "design_changes_requested"
  | "quote_accepted"

export interface QuoteCustomerActionProps {
  alert: {
    publicId: string
    customerEmail: string | null
    company: string | null
    action: QuoteCustomerActionKind
    /** Customer's free-text comment (change request notes, etc.). */
    comment: string | null
    quoteUrl: string | null
  }
  preview?: string
}

export const isQuoteCustomerActionData = (
  data: any
): data is QuoteCustomerActionProps =>
  typeof data?.alert === "object" &&
  typeof data?.alert?.publicId === "string" &&
  typeof data?.alert?.action === "string"

const COPY: Record<
  QuoteCustomerActionKind,
  { eyebrow: string; titleColor: string; body: string }
> = {
  design_approved: {
    eyebrow: "Design approved",
    titleColor: "#16a34a",
    body: "The customer has approved the mockup. You're clear to proceed — send the accept link if they haven't accepted the quote yet.",
  },
  design_changes_requested: {
    eyebrow: "Design changes requested",
    titleColor: "#f97316",
    body: "The customer wants changes to the mockup. Open the quote, re-design it in the Studio, then re-send the design approval link.",
  },
  quote_accepted: {
    eyebrow: "Quote accepted",
    titleColor: "#16a34a",
    body: "The customer accepted the quote — a cart has been created and they've been sent to checkout. The job lands in Orders once they complete payment.",
  },
}

export const QuoteCustomerActionEmail = ({
  alert,
  preview,
}: QuoteCustomerActionProps) => {
  const copy = COPY[alert.action] ?? COPY.quote_accepted
  const previewText = preview ?? `Quote ${alert.publicId}: ${copy.eyebrow}`

  return (
    <Base preview={previewText}>
      <Text style={STYLES.eyebrow}>{copy.eyebrow}</Text>
      <Text style={{ ...STYLES.h1, color: copy.titleColor }}>
        Quote {alert.publicId}
      </Text>

      <Text style={STYLES.body}>{copy.body}</Text>

      <Section
        style={{
          background: "#f9fafb",
          padding: "12px 16px",
          borderRadius: "8px",
          margin: "16px 0 0",
        }}
      >
        {alert.customerEmail ? (
          <Text style={{ ...STYLES.meta, margin: 0 }}>
            <strong>Customer:</strong> {alert.customerEmail}
          </Text>
        ) : null}
        {alert.company ? (
          <Text style={{ ...STYLES.meta, margin: "4px 0 0" }}>
            <strong>Company:</strong> {alert.company}
          </Text>
        ) : null}
        {alert.comment ? (
          <Text style={{ ...STYLES.meta, margin: "8px 0 0" }}>
            <strong style={{ color: NAVY }}>They said:</strong> “{alert.comment}”
          </Text>
        ) : null}
      </Section>

      {alert.quoteUrl ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Button href={alert.quoteUrl} style={STYLES.buttonPrimary}>
            Open quotes &rarr;
          </Button>
        </Section>
      ) : null}
    </Base>
  )
}

export default QuoteCustomerActionEmail

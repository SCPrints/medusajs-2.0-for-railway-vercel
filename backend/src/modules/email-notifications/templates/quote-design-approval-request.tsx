import { Button, Hr, Img, Section, Text } from "@react-email/components"

import { Base, MAGENTA } from "./base"

export const QUOTE_DESIGN_APPROVAL_REQUEST = "quote-design-approval-request"

export interface QuoteDesignApprovalRequestProps {
  approval: {
    firstName: string | null
    publicId: string
    /** Signed URL to the /quote-approval page. If null, button is omitted. */
    approvalUrl: string | null
    /** Mockup images (one per decorated side). */
    mockupImages?: { url: string; side: string; sideLabel?: string | null }[] | null
    /** Optional note from staff. */
    staffNote?: string | null
  }
  preview?: string
}

export const isQuoteDesignApprovalRequestData = (
  data: any
): data is QuoteDesignApprovalRequestProps =>
  typeof data?.approval === "object" &&
  typeof data?.approval?.publicId === "string"

export const QuoteDesignApprovalRequestEmail = ({
  approval,
  preview,
}: QuoteDesignApprovalRequestProps) => {
  const greeting = approval.firstName ? `Hi ${approval.firstName},` : "Hi,"
  const previewText = preview ?? "Your design is ready to review."
  const images =
    approval.mockupImages && approval.mockupImages.length > 0
      ? approval.mockupImages
      : null

  return (
    <Base preview={previewText}>
      <Text style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>
        {greeting}
      </Text>
      <Text style={{ margin: "12px 0 0", fontSize: "22px", fontWeight: 700, color: "#1a1a2e", lineHeight: "28px" }}>
        Your design is ready to review
      </Text>
      <Text style={{ margin: "12px 0 0", fontSize: "15px", color: "#374151", lineHeight: "23px" }}>
        We&apos;ve put together the mockup for quote {approval.publicId}. Have a
        look below and let us know it&apos;s good to go — or ask for changes.
      </Text>

      {images ? (
        <Section style={{ margin: "24px 0 0" }}>
          {images.map((img, i) => (
            <Section key={`${img.url}-${i}`} style={{ margin: "0 0 16px" }}>
              {img.sideLabel ? (
                <Text style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af" }}>
                  {img.sideLabel}
                </Text>
              ) : null}
              <Img
                src={img.url}
                alt={img.sideLabel ?? img.side}
                style={{ maxWidth: "100%", borderRadius: "8px", display: "block" }}
              />
            </Section>
          ))}
        </Section>
      ) : null}

      {approval.staffNote ? (
        <Text style={{ margin: "20px 0 0", fontSize: "14px", color: "#374151", fontStyle: "italic", background: "#f9fafb", padding: "12px 16px", borderRadius: "8px", borderLeft: `3px solid ${MAGENTA}` }}>
          {approval.staffNote}
        </Text>
      ) : null}

      {approval.approvalUrl ? (
        <Section style={{ margin: "28px 0 8px", textAlign: "center" }}>
          <Button
            href={approval.approvalUrl}
            style={{
              background: MAGENTA,
              color: "#ffffff",
              padding: "14px 32px",
              fontSize: "15px",
              fontWeight: 700,
              borderRadius: "8px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Review &amp; approve design →
          </Button>
        </Section>
      ) : null}

      <Hr style={{ margin: "24px 0 16px", borderColor: "#ebebeb" }} />

      <Text style={{ margin: 0, fontSize: "12px", color: "#9ca3af", lineHeight: "18px" }}>
        This link is unique to your quote. If colours, placement, or sizing need
        adjusting, reply to this email and we&apos;ll sort it before you confirm.
      </Text>
    </Base>
  )
}

QuoteDesignApprovalRequestEmail.PreviewProps = {
  approval: {
    firstName: "Sam",
    publicId: "Q-ABC123",
    approvalUrl: "https://www.scprints.com.au/au/quote-approval/test-id?sig=abc123",
    mockupImages: null,
    staffNote: null,
  },
} satisfies QuoteDesignApprovalRequestProps

export default QuoteDesignApprovalRequestEmail

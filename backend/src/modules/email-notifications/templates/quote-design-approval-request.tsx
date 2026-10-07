import { Button, Column, Hr, Img, Row, Section, Text } from "@react-email/components"

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
    /** Technique + size per decoration (lib/quote-decorations.ts). */
    decorations?: { label: string; method: string; detail: string }[] | null
    /** Present when staff send the whole quote: priced lines + accept link. */
    quote?: {
      lines: { title: string; quantity: number; unitPrice: number; total: number }[]
      total: number
      currencyCode: string
      acceptUrl: string
      expiresAt?: string | null
    } | null
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
  const q = approval.quote ?? null
  const money = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: q?.currencyCode || "AUD" }).format(n)
  const previewText =
    preview ?? (q ? `Your quote ${approval.publicId} — ${money(q.total)} inc GST` : "Your design is ready to review.")
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
        {q ? "Your quote is ready" : "Your design is ready to review"}
      </Text>
      <Text style={{ margin: "12px 0 0", fontSize: "15px", color: "#374151", lineHeight: "23px" }}>
        {q
          ? <>Here&apos;s quote {approval.publicId} with the mockup of your design. Check the design, then accept the quote to check out.</>
          : <>We&apos;ve put together the mockup for quote {approval.publicId}. Have a look below and let us know it&apos;s good to go — or ask for changes.</>}
      </Text>

      {approval.staffNote ? (
        <Text style={{ margin: "20px 0 0", fontSize: "14px", color: "#374151", background: "#f9fafb", padding: "12px 16px", borderRadius: "8px", borderLeft: `3px solid ${MAGENTA}`, whiteSpace: "pre-wrap" }}>
          {approval.staffNote}
        </Text>
      ) : null}

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

      {approval.decorations && approval.decorations.length > 0 ? (
        <Section style={{ margin: "8px 0 0" }}>
          <Text style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af" }}>
            Decoration details
          </Text>
          {approval.decorations.map((d, i) => (
            <Row key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <Column style={{ padding: "6px 0", fontSize: "14px", color: "#1a1a2e" }}>
                <strong>{d.label}</strong>
                {d.detail ? <span style={{ color: "#6b7280" }}> — {d.detail}</span> : null}
              </Column>
              <Column align="right" style={{ padding: "6px 0", fontSize: "14px", color: "#374151", whiteSpace: "nowrap" }}>
                {d.method}
              </Column>
            </Row>
          ))}
          <Text style={{ margin: "6px 0 0", fontSize: "12px", color: "#9ca3af" }}>
            Sizes are approximate and confirmed against your final artwork.
          </Text>
        </Section>
      ) : null}

      {q ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Text style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af" }}>
            Your quote
          </Text>
          {q.lines.map((l, i) => (
            <Row key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <Column style={{ padding: "6px 0", fontSize: "14px", color: "#1a1a2e" }}>
                {l.title}
                <span style={{ color: "#6b7280" }}> — {l.quantity} × {money(l.unitPrice)}</span>
              </Column>
              <Column align="right" style={{ padding: "6px 0", fontSize: "14px", color: "#1a1a2e", whiteSpace: "nowrap" }}>
                {money(l.total)}
              </Column>
            </Row>
          ))}
          <Row>
            <Column style={{ padding: "10px 0 0", fontSize: "15px", fontWeight: 700, color: "#1a1a2e" }}>Total (inc GST)</Column>
            <Column align="right" style={{ padding: "10px 0 0", fontSize: "15px", fontWeight: 700, color: "#1a1a2e" }}>{money(q.total)}</Column>
          </Row>
          {q.expiresAt ? (
            <Text style={{ margin: "6px 0 0", fontSize: "12px", color: "#9ca3af" }}>
              Valid until {new Date(q.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
            </Text>
          ) : null}
        </Section>
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

      {q ? (
        <Section style={{ margin: "8px 0 8px", textAlign: "center" }}>
          <Button
            href={q.acceptUrl}
            style={{
              background: "#1a1a2e",
              color: "#ffffff",
              padding: "14px 32px",
              fontSize: "15px",
              fontWeight: 700,
              borderRadius: "8px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Accept quote &amp; check out →
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
    staffNote: "Could you send higher-resolution artwork? Vector (AI, EPS, SVG, PDF) or 300 DPI PNG at print size.",
    decorations: [
      { label: "Front", method: "Embroidery", detail: "approx. 80 × 80 mm, ~20,500 stitches" },
      { label: "Back", method: "DTF print", detail: "approx. 20.1 × 15.9 cm" },
    ],
    quote: {
      lines: [{ title: "Unisex Multi-pocket Hoodie — Black/Charcoal / S", quantity: 2, unitPrice: 184.83, total: 369.66 }],
      total: 369.66,
      currencyCode: "AUD",
      acceptUrl: "https://www.scprints.com.au/au/quote-accept/test-id?sig=abc123",
      expiresAt: null,
    },
  },
} satisfies QuoteDesignApprovalRequestProps

export default QuoteDesignApprovalRequestEmail

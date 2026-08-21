import { Hr, Section, Text, Button } from "@react-email/components"

import { Base, STYLES, NAVY } from "./base"

export const PRICING_AUDIT_DIGEST = "pricing-audit-digest"

export interface PricingAuditDigestProps {
  digest: {
    /** e.g. "last 48h" */
    windowLabel: string
    orders: Array<{
      display_id: number | string
      order_id: string
      verdict: string
      findings: Array<{ kind: string; detail: string }>
    }>
    /** Invariant shadow-mode findings seen since the previous digest (count only). */
    invariantFindingCount?: number
    adminUrl: string | null
  }
  preview?: string
}

export const isPricingAuditDigestData = (
  data: any
): data is PricingAuditDigestProps =>
  typeof data?.digest === "object" && Array.isArray(data?.digest?.orders)

export const PricingAuditDigestEmail = ({
  digest,
  preview,
}: PricingAuditDigestProps) => {
  const previewText =
    preview ??
    `${digest.orders.length} order(s) flagged by the pricing audit (${digest.windowLabel}).`

  return (
    <Base preview={previewText}>
      <Text style={STYLES.eyebrow}>SC Prints pricing audit</Text>
      <Text style={{ ...STYLES.h1, color: "#dc2626" }}>
        {digest.orders.length} order{digest.orders.length === 1 ? "" : "s"} flagged
      </Text>

      <Text style={STYLES.body}>
        The daily pricing audit ({digest.windowLabel}) found orders whose
        charged prices don&apos;t match what the current pricing derives from
        their designs. Review each one — a legitimate staff deviation should be
        stamped with a <strong style={{ color: NAVY }}>price_override</strong>{" "}
        marker so it stops alerting.
      </Text>

      {digest.orders.map((order) => (
        <Section
          key={order.order_id}
          style={{
            background: "#f9fafb",
            padding: "12px 16px",
            borderRadius: "8px",
            margin: "12px 0 0",
          }}
        >
          <Text style={{ margin: 0, fontSize: "14px", color: NAVY }}>
            <strong>Order #{order.display_id}</strong> · verdict: {order.verdict}
          </Text>
          {order.findings.slice(0, 5).map((f, i) => (
            <Text
              key={i}
              style={{ margin: "4px 0 0", fontSize: "12px", color: "#4b5563" }}
            >
              {f.kind}: {f.detail}
            </Text>
          ))}
          {digest.adminUrl ? (
            <Text style={{ margin: "8px 0 0", fontSize: "12px" }}>
              <a
                href={`${digest.adminUrl}/app/orders/${order.order_id}`}
                style={{ color: "#2563eb" }}
              >
                Open order &rarr;
              </a>
            </Text>
          ) : null}
        </Section>
      ))}

      {typeof digest.invariantFindingCount === "number" &&
      digest.invariantFindingCount > 0 ? (
        <>
          <Hr style={{ margin: "20px 0" }} />
          <Text style={{ ...STYLES.body, fontSize: "13px" }}>
            The checkout invariant (shadow mode) also logged{" "}
            <strong style={{ color: NAVY }}>{digest.invariantFindingCount}</strong>{" "}
            finding event{digest.invariantFindingCount === 1 ? "" : "s"} — see
            PostHog: <em>checkout_price_invariant_finding</em>.
          </Text>
        </>
      ) : null}

      {digest.adminUrl ? (
        <Section style={{ margin: "20px 0 0" }}>
          <Button href={`${digest.adminUrl}/app/orders`} style={STYLES.buttonPrimary}>
            Open Orders &rarr;
          </Button>
        </Section>
      ) : null}
    </Base>
  )
}

export default PricingAuditDigestEmail

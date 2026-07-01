import { Text, Section, Hr } from '@react-email/components'
import * as React from 'react'
import { Base, STYLES, NAVY, SLATE, BG_SUBTLE } from './base'

export const TAX_INVOICE = 'tax-invoice'

export interface TaxInvoiceTemplateProps {
  customerFirstName?: string | null
  orderDisplayId: string | number
  orderDateFormatted: string
  orderTotalFormatted: string
  preview?: string
}

export const isTaxInvoiceData = (data: any): data is TaxInvoiceTemplateProps =>
  typeof data === 'object' &&
  data != null &&
  (typeof data.orderDisplayId === 'string' ||
    typeof data.orderDisplayId === 'number')

export const TaxInvoiceEmail: React.FC<TaxInvoiceTemplateProps> & {
  PreviewProps: TaxInvoiceTemplateProps
} = ({
  customerFirstName,
  orderDisplayId,
  orderDateFormatted,
  orderTotalFormatted,
  preview,
}) => {
  return (
    <Base preview={preview ?? `Your tax invoice for order #${orderDisplayId}`}>
      <Text style={STYLES.eyebrow}>Order #{orderDisplayId} &middot; Tax invoice</Text>
      <Text style={STYLES.h1}>Your tax invoice</Text>

      <Text style={STYLES.body}>
        {customerFirstName ? `Hi ${customerFirstName}, ` : 'Hi, '}
        thanks for your order. Your tax invoice is attached to this email as a
        PDF for your records.
      </Text>

      <Section
        style={{
          margin: '20px 0 0',
          padding: '12px 16px',
          background: BG_SUBTLE,
          borderRadius: '8px',
        }}
      >
        <Text style={{ margin: 0, fontSize: '14px', color: SLATE }}>
          <strong style={{ color: NAVY }}>Order:</strong> #{orderDisplayId}
        </Text>
        <Text style={{ margin: '4px 0 0', fontSize: '14px', color: SLATE }}>
          <strong style={{ color: NAVY }}>Date:</strong> {orderDateFormatted}
        </Text>
        <Text
          style={{
            margin: '8px 0 0',
            fontSize: '16px',
            fontWeight: 700,
            color: NAVY,
          }}
        >
          Total {orderTotalFormatted}
        </Text>
      </Section>

      <Hr style={STYLES.divider} />

      <Text style={STYLES.meta}>
        The attached PDF is your tax invoice. Reply to this email if anything
        looks off and we&apos;ll sort it out.
      </Text>
    </Base>
  )
}

TaxInvoiceEmail.PreviewProps = {
  customerFirstName: 'Sam',
  orderDisplayId: 'ORD-123',
  orderDateFormatted: '30 Jun 2026',
  orderTotalFormatted: '$120.00',
}

export default TaxInvoiceEmail

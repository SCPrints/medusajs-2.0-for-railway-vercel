import { Text, Section, Hr, Row, Column } from '@react-email/components'
import * as React from 'react'
import { Base, STYLES, NAVY, SLATE, BORDER, BG_SUBTLE } from './base'
import { OrderDTO, OrderAddressDTO } from '@medusajs/framework/types'

export const FULFILLMENT_ORDER_PLACED = 'fulfillment-order-placed'

function formatPrice(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount)
}

interface FulfillmentOrderPlacedPreviewProps {
  order: OrderDTO & {
    display_id: string
    summary: { raw_current_order_total: { value: number } }
  }
  shippingAddress: OrderAddressDTO
  organisationName: string
  destinationName?: string | null
  destinationDeliveryNotes?: string | null
  externalRef?: string | null
  requestedShipBy?: string | null
  placedByName?: string | null
}

export interface FulfillmentOrderPlacedTemplateProps {
  order: OrderDTO & {
    display_id: string
    summary: { raw_current_order_total: { value: number } }
  }
  shippingAddress: OrderAddressDTO
  preview?: string
  /** When `merchant`, copy is aimed at the production team instead of the customer. */
  audience?: 'customer' | 'merchant'
  /** Organisation name displayed in eyebrow + body. */
  organisationName: string
  destinationName?: string | null
  destinationDeliveryNotes?: string | null
  externalRef?: string | null
  requestedShipBy?: string | null
  placedByName?: string | null
}

export const isFulfillmentOrderPlacedData = (
  data: any
): data is FulfillmentOrderPlacedTemplateProps =>
  typeof data?.order === 'object' &&
  typeof data?.shippingAddress === 'object' &&
  typeof data?.organisationName === 'string'

export const FulfillmentOrderPlacedTemplate: React.FC<FulfillmentOrderPlacedTemplateProps> & {
  PreviewProps: FulfillmentOrderPlacedPreviewProps
} = ({
  order,
  shippingAddress,
  preview,
  audience = 'customer',
  organisationName,
  destinationName,
  destinationDeliveryNotes,
  externalRef,
  requestedShipBy,
  placedByName,
}) => {
  const isMerchant = audience === 'merchant'
  const effectivePreview =
    preview ??
    (isMerchant
      ? `New fulfillment order from ${organisationName} — #${order.display_id}`
      : `Fulfillment order #${order.display_id} placed for ${organisationName}.`)
  const eyebrow = isMerchant
    ? `New fulfillment order · ${organisationName}`
    : `${organisationName} · Restock confirmation`
  const title = isMerchant
    ? `New fulfillment order from ${organisationName}`
    : 'Thanks — your restock is in'

  const items = order.items ?? []

  return (
    <Base preview={effectivePreview}>
      <Text style={STYLES.eyebrow}>
        Order #{order.display_id} &middot; {eyebrow}
      </Text>
      <Text style={STYLES.h1}>{title}</Text>

      {isMerchant ? (
        <Section style={{ margin: '20px 0 0' }}>
          <Text style={{ ...STYLES.body, margin: 0 }}>
            <strong style={{ color: NAVY }}>Organisation:</strong>{' '}
            {organisationName}
          </Text>
          {placedByName ? (
            <Text style={{ ...STYLES.body, margin: '4px 0 0' }}>
              <strong style={{ color: NAVY }}>Placed by:</strong> {placedByName}
            </Text>
          ) : null}
          {destinationName ? (
            <Text style={{ ...STYLES.body, margin: '4px 0 0' }}>
              <strong style={{ color: NAVY }}>Destination:</strong>{' '}
              {destinationName}
            </Text>
          ) : null}
          {externalRef ? (
            <Text style={{ ...STYLES.body, margin: '4px 0 0' }}>
              <strong style={{ color: NAVY }}>Their ref:</strong> {externalRef}
            </Text>
          ) : null}
          {requestedShipBy ? (
            <Text style={{ ...STYLES.body, margin: '4px 0 0' }}>
              <strong style={{ color: NAVY }}>Needed by:</strong>{' '}
              {requestedShipBy}
            </Text>
          ) : null}
        </Section>
      ) : (
        <Text style={STYLES.body}>
          We&apos;ve received the restock order for{' '}
          <strong style={{ color: NAVY }}>{organisationName}</strong>. We&apos;ll
          email you when each milestone moves — production, dispatch, and
          delivery. Here&apos;s a copy for your records.
        </Text>
      )}

      <Hr style={STYLES.divider} />

      <Text style={STYLES.h2}>Order summary</Text>
      <Section
        style={{
          margin: '12px 0 0',
          padding: '12px 16px',
          background: BG_SUBTLE,
          borderRadius: '8px',
        }}
      >
        <Text style={{ margin: 0, fontSize: '14px', color: SLATE }}>
          <strong style={{ color: NAVY }}>Order:</strong> #{order.display_id}
        </Text>
        <Text style={{ margin: '4px 0 0', fontSize: '14px', color: SLATE }}>
          <strong style={{ color: NAVY }}>Placed:</strong>{' '}
          {new Date(order.created_at).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
        {externalRef && !isMerchant ? (
          <Text style={{ margin: '4px 0 0', fontSize: '14px', color: SLATE }}>
            <strong style={{ color: NAVY }}>Your ref:</strong> {externalRef}
          </Text>
        ) : null}
        <Text
          style={{
            margin: '8px 0 0',
            fontSize: '16px',
            fontWeight: 700,
            color: NAVY,
          }}
        >
          Total{' '}
          {formatPrice(
            order.summary.raw_current_order_total.value,
            order.currency_code
          )}
        </Text>
      </Section>

      <Hr style={STYLES.divider} />

      <Text style={STYLES.h2}>Shipping to</Text>
      {destinationName ? (
        <Text style={{ ...STYLES.body, margin: '6px 0 0', fontWeight: 600 }}>
          {destinationName}
        </Text>
      ) : null}
      <Text style={{ ...STYLES.body, margin: '6px 0 0' }}>
        {shippingAddress.address_1}
      </Text>
      {shippingAddress.address_2 ? (
        <Text style={{ ...STYLES.body, margin: '2px 0 0' }}>
          {shippingAddress.address_2}
        </Text>
      ) : null}
      <Text style={{ ...STYLES.body, margin: '2px 0 0' }}>
        {shippingAddress.city}, {shippingAddress.province}{' '}
        {shippingAddress.postal_code}
      </Text>
      <Text style={{ ...STYLES.body, margin: '2px 0 0' }}>
        {shippingAddress.country_code?.toUpperCase()}
      </Text>
      {destinationDeliveryNotes ? (
        <Text style={{ ...STYLES.meta, margin: '10px 0 0' }}>
          {destinationDeliveryNotes}
        </Text>
      ) : null}

      <Hr style={STYLES.divider} />

      <Text style={STYLES.h2}>Items</Text>
      <Section
        style={{
          width: '100%',
          margin: '12px 0 0',
          border: `1px solid ${BORDER}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <Row
          style={{
            background: BG_SUBTLE,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Column
            style={{
              padding: '10px 12px',
              fontWeight: 700,
              fontSize: '12px',
              color: NAVY,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Item
          </Column>
          <Column
            style={{
              padding: '10px 12px',
              fontWeight: 700,
              fontSize: '12px',
              color: NAVY,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'center',
              width: '60px',
            }}
          >
            Qty
          </Column>
          <Column
            style={{
              padding: '10px 12px',
              fontWeight: 700,
              fontSize: '12px',
              color: NAVY,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'right',
              width: '90px',
            }}
          >
            Price
          </Column>
        </Row>
        {items.map((item, idx) => (
          <Row
            key={item.id}
            style={{
              borderBottom:
                idx === items.length - 1 ? 'none' : `1px solid ${BORDER}`,
            }}
          >
            <Column
              style={{ padding: '10px 12px', fontSize: '14px', color: SLATE }}
            >
              {item.title || item.product_title}
            </Column>
            <Column
              style={{
                padding: '10px 12px',
                fontSize: '14px',
                color: SLATE,
                textAlign: 'center',
                width: '60px',
              }}
            >
              {item.quantity}
            </Column>
            <Column
              style={{
                padding: '10px 12px',
                fontSize: '14px',
                color: SLATE,
                textAlign: 'right',
                width: '90px',
                whiteSpace: 'nowrap',
              }}
            >
              {formatPrice(item.unit_price, order.currency_code)}
            </Column>
          </Row>
        ))}
      </Section>

      <Text style={{ ...STYLES.meta, margin: '24px 0 0' }}>
        Need to change this order? Cancel from your portal within 24 hours of
        placing, or reply to this email and we&apos;ll sort it out.
      </Text>
    </Base>
  )
}

FulfillmentOrderPlacedTemplate.PreviewProps = {
  order: {
    id: 'test-order-id',
    display_id: 'ORD-3902',
    created_at: new Date().toISOString(),
    email: 'alex@lifegrain.example',
    currency_code: 'AUD',
    items: [
      {
        id: 'item-1',
        title: 'Logo White — LifeGrain S',
        product_title: 'LifeGrain Tee',
        quantity: 10,
        unit_price: 14,
      },
      {
        id: 'item-2',
        title: 'Logo White — LifeGrain M',
        product_title: 'LifeGrain Tee',
        quantity: 6,
        unit_price: 14,
      },
    ],
    shipping_address: {
      first_name: 'Lifegrain',
      last_name: 'Sutherland',
      address_1: '123 Acuna St',
      city: 'Sutherland',
      province: 'NSW',
      postal_code: '2232',
      country_code: 'au',
    },
    summary: { raw_current_order_total: { value: 224 } },
  },
  shippingAddress: {
    first_name: 'Lifegrain',
    last_name: 'Sutherland',
    address_1: '123 Acuna St',
    city: 'Sutherland',
    province: 'NSW',
    postal_code: '2232',
    country_code: 'au',
  },
  organisationName: 'Lifegrain Cafe',
  destinationName: 'Lifegrain Sutherland Hospital',
  destinationDeliveryNotes: 'Gate code: 2200. Receiving 7am–3pm Mon–Fri.',
  externalRef: '8517',
  requestedShipBy: '2026-06-10',
  placedByName: 'Alex Chen',
} as FulfillmentOrderPlacedPreviewProps

export default FulfillmentOrderPlacedTemplate

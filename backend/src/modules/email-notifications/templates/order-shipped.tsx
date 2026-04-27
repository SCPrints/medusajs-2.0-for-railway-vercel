import { Text, Section, Hr, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import { OrderDTO, OrderAddressDTO } from '@medusajs/framework/types'

export const ORDER_SHIPPED = 'order-shipped'

export interface OrderShippedParcel {
  tracking_number: string
  tracking_url: string
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  weight_grams?: number | null
  shipped_at?: string | null
}

interface OrderShippedPreviewProps {
  order: OrderDTO & { display_id: string }
  shippingAddress: OrderAddressDTO
  parcels: OrderShippedParcel[]
}

export interface OrderShippedTemplateProps {
  order: OrderDTO & { display_id: string }
  shippingAddress: OrderAddressDTO
  parcels: OrderShippedParcel[]
  preview?: string
}

export const isOrderShippedTemplateData = (
  data: any
): data is OrderShippedTemplateProps =>
  typeof data?.order === 'object' &&
  typeof data?.shippingAddress === 'object' &&
  Array.isArray(data?.parcels)

const formatCarrier = (parcel: OrderShippedParcel): string => {
  if (parcel.carrier_code) {
    return parcel.carrier_code
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  if (parcel.carrier_id) {
    return parcel.carrier_id
  }
  return 'Carrier'
}

export const OrderShippedTemplate: React.FC<OrderShippedTemplateProps> & {
  PreviewProps: OrderShippedPreviewProps
} = ({
  order,
  shippingAddress,
  parcels,
  preview = 'Your order is on its way!',
}) => {
  const parcelCount = parcels.length
  return (
    <Base preview={preview}>
      <Section>
        <Text
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            textAlign: 'center',
            margin: '0 0 30px',
          }}
        >
          Your order has shipped
        </Text>

        <Text style={{ margin: '0 0 15px' }}>
          Hi {shippingAddress.first_name} {shippingAddress.last_name},
        </Text>

        <Text style={{ margin: '0 0 20px' }}>
          Order <strong>{order.display_id}</strong> is on its way. We split it
          into {parcelCount} {parcelCount === 1 ? 'parcel' : 'parcels'} — track
          each below.
        </Text>

        <Hr style={{ margin: '20px 0' }} />

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
          Tracking
        </Text>

        {parcels.map((parcel, idx) => (
          <Section
            key={parcel.tracking_number || `parcel-${idx}`}
            style={{
              padding: '12px 0',
              borderBottom:
                idx === parcels.length - 1 ? 'none' : '1px solid #eaeaea',
            }}
          >
            <Text style={{ margin: '0 0 6px', fontWeight: 'bold' }}>
              Parcel {idx + 1} of {parcelCount} · {formatCarrier(parcel)}
            </Text>
            <Text style={{ margin: '0 0 8px', color: '#555' }}>
              Tracking: {parcel.tracking_number || '—'}
            </Text>
            {parcel.tracking_url && (
              <Button
                href={parcel.tracking_url}
                style={{
                  background: '#000',
                  color: '#fff',
                  padding: '10px 16px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  display: 'inline-block',
                }}
              >
                Track parcel {idx + 1}
              </Button>
            )}
          </Section>
        ))}

        <Hr style={{ margin: '20px 0' }} />

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
          Delivering to
        </Text>
        <Text style={{ margin: '0 0 5px' }}>{shippingAddress.address_1}</Text>
        <Text style={{ margin: '0 0 5px' }}>
          {shippingAddress.city}, {shippingAddress.province}{' '}
          {shippingAddress.postal_code}
        </Text>
        <Text style={{ margin: '0 0 20px' }}>{shippingAddress.country_code}</Text>

        <Text style={{ margin: '20px 0 0', color: '#555' }}>
          Reply to this email if anything looks off and we'll sort it out for
          you.
        </Text>
      </Section>
    </Base>
  )
}

OrderShippedTemplate.PreviewProps = {
  order: {
    id: 'test-order-id',
    display_id: 'ORD-123',
    email: 'test@example.com',
    currency_code: 'AUD',
    created_at: new Date().toISOString(),
  } as any,
  shippingAddress: {
    first_name: 'Test',
    last_name: 'User',
    address_1: '123 Main St',
    city: 'Sydney',
    province: 'NSW',
    postal_code: '2000',
    country_code: 'AU',
  } as OrderAddressDTO,
  parcels: [
    {
      tracking_number: 'AP1234567890AU',
      tracking_url:
        'https://auspost.com.au/mypost/track/#/details/AP1234567890AU',
      carrier_code: 'auspost',
      service_code: 'parcel_post',
    },
    {
      tracking_number: 'AP0987654321AU',
      tracking_url:
        'https://auspost.com.au/mypost/track/#/details/AP0987654321AU',
      carrier_code: 'auspost',
      service_code: 'parcel_post',
    },
  ],
}

export default OrderShippedTemplate

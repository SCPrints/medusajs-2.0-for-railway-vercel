import { Container, Text } from "@medusajs/ui"

import { isStripe, paymentInfoMap } from "@lib/constants"
import { convertMinorToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const ColLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs uppercase tracking-wide text-ui-fg-subtle mb-2">
    {children}
  </span>
)

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0].payments?.[0]

  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--brand-primary)] border-l-4 border-[var(--brand-secondary)] pl-4 mb-5">
        Payment
      </h2>
      {payment && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex flex-col">
            <ColLabel>Payment method</ColLabel>
            <Text
              className="text-sm text-[var(--brand-primary)] font-medium"
              data-testid="payment-method"
            >
              {paymentInfoMap[payment.provider_id].title}
            </Text>
          </div>
          <div className="flex flex-col sm:col-span-2">
            <ColLabel>Payment details</ColLabel>
            <div className="flex gap-2 text-sm text-ui-fg-subtle items-center">
              <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                {paymentInfoMap[payment.provider_id].icon}
              </Container>
              <Text data-testid="payment-amount">
                {isStripe(payment.provider_id) && payment.data?.card_last4
                  ? `**** **** **** ${payment.data.card_last4}`
                  : `${convertMinorToLocale({
                      amount: payment.amount,
                      currency_code: order.currency_code,
                    })} paid at ${new Date(
                      payment.created_at ?? ""
                    ).toLocaleString()}`}
              </Text>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentDetails

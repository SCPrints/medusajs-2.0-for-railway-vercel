import { listCartShippingOptions } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const shippingResponse = await listCartShippingOptions(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  if (!paymentMethods) {
    return null
  }

  return (
    <div>
      <div className="grid w-full grid-cols-1 gap-y-0 divide-y divide-[rgba(26,26,46,0.1)]">
        <div className="pb-10 pt-0 first:pt-0">
          <Addresses cart={cart} customer={customer} />
        </div>

        <div className="py-10">
          <Shipping
            cart={cart}
            availableShippingMethods={shippingResponse.shipping_options}
            shippingTier={shippingResponse.tier}
            totalWeightGrams={shippingResponse.total_weight_grams}
            thresholdGrams={shippingResponse.threshold_grams}
          />
        </div>

        <div className="py-10">
          <Payment cart={cart} availablePaymentMethods={paymentMethods} />
        </div>

        <div className="pb-0 pt-10">
          <Review cart={cart} />
        </div>
      </div>
    </div>
  )
}

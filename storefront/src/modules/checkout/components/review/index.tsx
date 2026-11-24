"use client"

import { Heading, Text, clx } from "@medusajs/ui"

import PaymentButton from "../payment-button"
import PoNumber from "../po-number"
import PoDocument from "../po-document"
import DeliveryEstimate from "@modules/cart/components/delivery-estimate"
import { useSearchParams } from "next/navigation"

const PACKING_LABEL: Record<string, string> = {
  bulk: "Packed in bulk",
  by_size: "Sorted by size",
  by_unit: "Sorted by unit",
  individual: "Bagged and labelled for each person",
}

/** What the team order form attached to this cart (roster, packing, names). */
const TeamOrderSummary = ({ metadata }: { metadata: Record<string, unknown> | null | undefined }) => {
  const roster = metadata?.roster as { total?: number } | undefined
  const packing = typeof metadata?.packing === "string" ? PACKING_LABEL[metadata.packing] : null
  const names = metadata?.personalisation_requested === true
  if (!roster?.total && !packing && !names) return null
  return (
    <div
      className="mb-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-sm text-ui-fg-base"
      data-testid="team-order-summary"
    >
      <p className="font-semibold">Team order</p>
      <ul className="m-0 mt-1 list-none p-0 text-ui-fg-subtle">
        {roster?.total ? <li>For {roster.total} {roster.total === 1 ? "person" : "people"} on your list</li> : null}
        {packing ? <li>{packing}</li> : null}
        {names ? (
          <li>
            {metadata?.names_numbers
              ? "Names and numbers are in your cart. We'll use the names on your list."
              : "We'll confirm the price for names and numbers before we print."}
          </li>
        ) : null}
      </ul>
    </div>
  )
}

const Review = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="bg-transparent">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row items-baseline gap-x-2 text-2xl font-semibold tracking-tight text-ink",
            {
              "pointer-events-none select-none opacity-50": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                By clicking the Place Order button, you confirm that you have
                read, understand and accept our Terms of Use, Terms of Sale and
                Returns Policy and acknowledge that you have read SC
                Prints&apos; Privacy Policy.
              </Text>
            </div>
          </div>
          <TeamOrderSummary metadata={cart?.metadata as Record<string, unknown> | null} />
          {Array.isArray(cart?.metadata?.home_delivery) && cart.metadata.home_delivery.length ? (
            <p className="mb-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-sm text-ui-fg-base" data-testid="home-delivery-summary">
              We&apos;ll post each pack to the {cart.metadata.home_delivery.length === 1 ? "address" : `${cart.metadata.home_delivery.length} addresses`} your people gave us. That postage is a line in your cart.
            </p>
          ) : null}
          <div className="mb-6">
            <DeliveryEstimate cartMetadata={cart?.metadata as Record<string, unknown> | null} />
          </div>
          <PoNumber
            initial={
              typeof cart?.metadata?.po_number === "string" ? cart.metadata.po_number : ""
            }
          />
          {cart?.id ? (
            <PoDocument
              cartId={cart.id}
              initial={(cart.metadata as { po_document?: { url: string; name: string } } | null)?.po_document ?? null}
            />
          ) : null}
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review

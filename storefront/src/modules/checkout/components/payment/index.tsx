"use client"

import {
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RadioGroup } from "@headlessui/react"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, Tooltip, clx } from "@medusajs/ui"
import { PaymentElement } from "@stripe/react-stripe-js"

import PaymentContainer from "@modules/checkout/components/payment-container"
import {
  StripeAcceptedCardMarks,
  StripePaymentTrustFootnote,
} from "@modules/checkout/components/stripe-payment-trust"
import { isManual, isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import OrgOrder, { activeCostCentres } from "@modules/checkout/components/org-order"
import {
  setCartOrgOrder,
  type OrgAccount,
  type OrgOrderSelection,
} from "@lib/data/org-account"
import {
  StripeContext,
  isPaidIntentStatus,
  stripePromise,
} from "@modules/checkout/components/payment-wrapper"
import { initiatePaymentSession, placeOrder } from "@lib/data/cart"
import { orThrow } from "@lib/util/action-result"

/** Medusa's manual provider: only ever offered as "Pay on account" to an approved organisation's buyer. */
const ON_ACCOUNT_PROVIDER = "pp_system_default"

const Payment = ({
  cart,
  availablePaymentMethods,
  orgOptions = [],
}: {
  cart: any
  availablePaymentMethods: any[]
  /** Organisations this customer can order for; empty for everyone else. */
  orgOptions?: OrgAccount[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession: any) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentElementComplete, setPaymentElementComplete] = useState(false)
  const [paymentMethodType, setPaymentMethodType] = useState<string | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.provider_id ?? ""
  )

  // Ordering for an organisation: who, cost centre, blanket PO.
  const cartMeta = (cart?.metadata ?? {}) as Record<string, unknown>
  const [orgSel, setOrgSel] = useState<OrgOrderSelection>(() => {
    const id = typeof cartMeta.organisation_id === "string" ? cartMeta.organisation_id : ""
    const known = orgOptions.find((o) => o.organisation.id === id)
    // Only values that belong to this organisation: a cart can carry another
    // organisation's cost centre or PO from an earlier draft.
    const centre = typeof cartMeta.cost_centre === "string" ? cartMeta.cost_centre : ""
    const poId = typeof cartMeta.organisation_po_id === "string" ? cartMeta.organisation_po_id : ""
    return {
      organisation_id: known ? id : null,
      cost_centre: known && activeCostCentres(known).some((c) => c.code === centre) ? centre : null,
      organisation_po_id: known && (known.purchase_orders ?? []).some((p) => p.id === poId) ? poId : null,
    }
  })
  const org = orgOptions.find((o) => o.organisation.id === orgSel.organisation_id) ?? null
  const accountOption = org?.checkout?.pay_on_account ?? null
  const needsApproval = org?.checkout?.needs_approval ?? null
  const onAccountSelected = isManual(selectedPaymentMethod)
  const accountTitle = `Pay on account · invoice due in ${org?.account.terms_days ?? 30} days`

  // "Pay on account" only stays selected while the chosen organisation allows it.
  useEffect(() => {
    if (onAccountSelected && accountOption?.ok !== true) setSelectedPaymentMethod("")
  }, [onAccountSelected, accountOption])

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  /** Use the *selected* provider for UI/validation, not the pending session (selection can differ until submit). */
  const stripeSelected = isStripeFunc(selectedPaymentMethod)
  const stripeReady = useContext(StripeContext)
  const stripeSessionReady =
    stripeSelected && stripeReady && activeSession?.provider_id === selectedPaymentMethod

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const paymentReady =
    (activeSession && (cart?.shipping_methods?.length ?? 0) > 0) ||
    paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      if (orgOptions.length) {
        if (org && activeCostCentres(org).length && !orgSel.cost_centre) {
          setError("Choose a cost centre for this order.")
          return
        }
        // Saved before the payment session: the backend checks the
        // organisation on the cart when "Pay on account" is chosen.
        const saved = await setCartOrgOrder(orgSel)
        if (!saved.ok) {
          setError(saved.error)
          return
        }
      }

      const needsPaymentInit =
        !activeSession ||
        activeSession.provider_id !== selectedPaymentMethod

      // Don't combine `router.refresh()` with a transition-wrapped
      // `router.push()` — the two reconcilers can leave React's transition
      // state pending indefinitely, which keeps the button stuck on its
      // spinner with no "Continue to review" text. `initiatePaymentSession`
      // already calls `updateTag("cart")`, so `router.push` will pick
      // up the new payment session on its own.
      if (needsPaymentInit) {
        await orThrow(
          initiatePaymentSession(cart, {
            provider_id: selectedPaymentMethod,
          })
        )

        // For Stripe we early-return here so the user can fill in the
        // PaymentElement before the second click advances to review.
        // `initiatePaymentSession` only invalidates the cart cache —
        // it does NOT re-render the already-mounted server tree, so the
        // parent <Wrapper> would keep handing us the old cart (no Stripe
        // session, no client_secret) and <PaymentElement> would never mount.
        // `router.refresh()` forces the re-fetch so the Stripe Elements
        // provider mounts on the next render. Safe here because we are NOT
        // also calling `router.push()` on this branch — the comment below
        // about not combining refresh + push only applies to the
        // advance-to-review path.
        if (stripeSelected) {
          router.refresh()
          return
        }
      }

      // PaymentElement must be complete before advancing (first submit may only create the session).
      if (stripeSelected && !paymentElementComplete) {
        return
      }

      router.push(
        pathname + "?" + createQueryString("step", "review"),
        {
          scroll: false,
        }
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="bg-transparent">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row items-baseline gap-x-2 text-2xl font-semibold tracking-tight text-ink",
            {
              "pointer-events-none select-none opacity-50": !isOpen && !paymentReady,
            }
          )}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-payment-button"
            >
              Edit
            </button>
          </Text>
        )}
      </div>
      <div>
        <div className={isOpen ? "block" : "hidden"}>
          {orgOptions.length ? (
            <OrgOrder options={orgOptions} value={orgSel} onChange={setOrgSel} />
          ) : null}
          {!paidByGiftcard && availablePaymentMethods?.length && (
            <>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setSelectedPaymentMethod(value)}
              >
                {availablePaymentMethods
                  .sort((a, b) => {
                    return a.provider_id > b.provider_id ? 1 : -1
                  })
                  .map((paymentMethod) => {
                    return (
                      <PaymentContainer
                        paymentInfoMap={paymentInfoMap}
                        paymentProviderId={paymentMethod.id}
                        key={paymentMethod.id}
                        selectedPaymentOptionId={selectedPaymentMethod}
                      />
                    )
                  })}
                {accountOption ? (
                  <PaymentContainer
                    paymentInfoMap={{
                      ...paymentInfoMap,
                      [ON_ACCOUNT_PROVIDER]: { ...paymentInfoMap[ON_ACCOUNT_PROVIDER], title: accountTitle },
                    }}
                    paymentProviderId={ON_ACCOUNT_PROVIDER}
                    selectedPaymentOptionId={selectedPaymentMethod}
                    disabled={accountOption.ok !== true}
                  />
                ) : null}
              </RadioGroup>
              {accountOption && accountOption.ok === false ? (
                <p className="mb-2 text-sm text-ui-fg-subtle">{accountOption.message}</p>
              ) : null}
              {onAccountSelected && org ? (
                <p className="mb-2 text-sm text-ui-fg-subtle">
                  No card needed. We&apos;ll send {org.organisation.name} a tax invoice
                  {org.account.ap_email ? ` (and a copy to ${org.account.ap_email})` : ""}.
                </p>
              ) : null}
              {stripeSelected && stripeReady && (
                <div className="mt-5 space-y-3 transition-all duration-150 ease-in-out">
                  <StripeAcceptedCardMarks />

                  <PaymentElement
                    // Stripe.js 7+ defaults to an accordion; keep the tabs customers know.
                    options={{ layout: "tabs" }}
                    onChange={(e) => {
                      setError(null)
                      setPaymentElementComplete(e.complete)
                      setPaymentMethodType((e.value as any)?.type ?? null)
                    }}
                    // Since Stripe.js "clover" the form refuses to load for an intent
                    // it considers finished. If the customer has in fact already paid
                    // (e.g. the order failed to save after payment), finish the order
                    // rather than leave them at an empty form.
                    onLoadError={async () => {
                      const secret = activeSession?.data?.client_secret
                      const stripe = await stripePromise
                      const result = secret ? await stripe?.retrievePaymentIntent(secret) : undefined
                      if (isPaidIntentStatus(result?.paymentIntent?.status)) {
                        await orThrow(placeOrder()).catch((err) => setError(err.message))
                        return
                      }
                      setError("The card form couldn't load. Please refresh the page and try again.")
                    }}
                  />

                  <StripePaymentTrustFootnote />
                </div>
              )}
            </>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          <Button
            size="large"
            variant="primary"
            className="checkout-primary-action mt-6 w-full small:w-auto"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              (stripeSelected && stripeSessionReady && !paymentElementComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard) ||
              !!needsApproval
            }
            data-testid="submit-payment-button"
          >
            Continue to review
          </Button>
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex items-start gap-x-1 w-full">
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment method
                </Text>
                <Text
                  className="txt-medium text-ui-fg-subtle"
                  data-testid="payment-method-summary"
                >
                  {onAccountSelected
                    ? "Pay on account"
                    : paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod}
                </Text>
              </div>
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment details
                </Text>
                <div
                  className="flex gap-2 txt-medium text-ui-fg-subtle items-center"
                  data-testid="payment-details-summary"
                >
                  <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                    {paymentInfoMap[selectedPaymentMethod]?.icon || (
                      <CreditCard />
                    )}
                  </Container>
                  <Text>
                    {onAccountSelected
                      ? `Invoice due in ${org?.account.terms_days ?? 30} days`
                      : isStripeFunc(selectedPaymentMethod) && paymentMethodType
                      ? paymentMethodType === "afterpay_clearpay"
                        ? "Afterpay"
                        : paymentMethodType.charAt(0).toUpperCase() +
                          paymentMethodType.slice(1)
                      : "Another step will appear"}
                  </Text>
                </div>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default Payment

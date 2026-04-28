import { Text } from "@medusajs/ui"

/** Trust cues for Stripe CardElement; assets: Simple Icons MIT (visa, mastercard, stripe-symbol) + AmEx styled text. */

function PadlockGlyph(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 10V8a5 5 0 1110 0v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  )
}

/** Shown above the card field. */
export function StripeAcceptedCardMarks() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2"
      role="note"
    >
      <Text className="txt-compact-small text-ui-fg-muted">Accepted cards</Text>
      <span className="sr-only">Visa, Mastercard, and American Express</span>
      <div
        aria-hidden
        className="flex flex-wrap items-center gap-x-3 gap-y-2 opacity-[0.92]"
      >
        <img
          src="/checkout/visa.svg"
          alt=""
          width={52}
          height={32}
          className="h-5 w-auto"
        />
        <img
          src="/checkout/mastercard.svg"
          alt=""
          width={52}
          height={32}
          className="h-5 w-auto"
        />
        <span className="inline-flex rounded-sm border border-[#016fd0]/20 bg-[#016fd0]/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-[#016fd0]">
          AmEx
        </span>
      </div>
    </div>
  )
}

/** Shown below the card field. */
export function StripePaymentTrustFootnote() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-ui-border-base pt-4">
      <div className="flex max-w-xl items-start gap-2">
        <PadlockGlyph className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ui-fg-muted" />
        <div className="flex flex-col gap-y-2">
          <Text className="txt-small-regular text-ui-fg-subtle">
            Your card details are encrypted. Payments are handled securely by
            Stripe.
          </Text>
          <a
            href="https://stripe.com/docs/security"
            target="_blank"
            rel="noopener noreferrer"
            className="txt-small-regular w-fit font-medium text-ui-fg-muted underline-offset-4 hover:text-ui-fg-interactive hover:underline"
          >
            How Stripe protects your payment
          </a>
        </div>
      </div>
      <a
        href="https://stripe.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Stripe — payments infrastructure"
        className="flex shrink-0 items-center rounded-rounded border border-transparent p-2 transition-colors hover:bg-ui-bg-subtle-hover hover:border-ui-border-base"
      >
        <img
          src="/checkout/stripe-symbol.svg"
          alt=""
          width={28}
          height={28}
          className="h-8 w-8 shrink-0 select-none object-contain"
        />
        <span className="txt-compact-medium ml-1.5 font-semibold lowercase leading-none text-[#635BFF]">
          stripe
        </span>
      </a>
    </div>
  )
}

import { acceptMyQuote, type AccountQuoteDetail } from "@lib/data/quotes-account"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import DecorationList from "@modules/quote-accept/components/decoration-list"
import JobBreakdown from "@modules/quote-accept/components/job-breakdown"

import AcceptButton from "./accept-button"
import { QuoteLines, QuoteStatusBadge } from "./index"
import { STATUS_HELP, money, shortDate, validityLabel } from "./format"

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ui-border-base bg-white px-4 py-2.5 text-sm font-semibold text-ui-fg-base! hover:bg-ui-bg-subtle"
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"

const QuoteDetail = ({
  quote,
  countryCode,
  acceptFailed,
}: {
  quote: AccountQuoteDetail
  countryCode: string
  acceptFailed?: boolean
}) => {
  const validity = validityLabel(quote.status, quote.expires_at)
  return (
    <div className="flex flex-col gap-6" data-testid="quote-detail">
      <LocalizedClientLink href="/account/quotes" className="text-sm text-ui-fg-subtle hover:text-ui-fg-base">
        ← All quotes
      </LocalizedClientLink>

      <header className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-brand pl-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">Quote</p>
          <h1 className="mt-1 text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8">{quote.public_id}</h1>
          <p className="mt-1 text-sm text-ui-fg-subtle">
            {shortDate(quote.created_at)}
            {quote.company ? ` · ${quote.company}` : ""}
            {quote.subject ? ` · ${quote.subject}` : ""}
          </p>
        </div>
        <QuoteStatusBadge quote={quote} />
      </header>

      <div className="rounded-xl bg-ui-bg-subtle p-4 small:p-5">
        <p className="text-sm text-ui-fg-base">{STATUS_HELP[quote.status]}</p>
        {acceptFailed ? (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            We couldn&apos;t open this quote to accept it. Please try again, or contact us.
          </p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 tablet:flex-row tablet:items-center">
          {quote.can_accept ? (
            <form action={acceptMyQuote.bind(null, countryCode, quote.id)} className="contents">
              <AcceptButton />
            </form>
          ) : null}
          {quote.status === "cart" ? (
            <LocalizedClientLink href="/cart" className={primaryButton} data-testid="quote-cart-link">
              Go to cart
            </LocalizedClientLink>
          ) : null}
          {quote.pay_url ? (
            <a href={quote.pay_url} className={primaryButton} data-testid="quote-pay-link">
              Pay now
            </a>
          ) : null}
          {quote.order ? (
            quote.order.in_account ? (
              <LocalizedClientLink href={`/account/orders/details/${quote.order.id}`} className={secondaryButton} data-testid="quote-order-link">
                View order{quote.order.display_id ? ` #${quote.order.display_id}` : ""}
              </LocalizedClientLink>
            ) : quote.order.display_id ? (
              <span className="text-sm text-ui-fg-subtle">Order #{quote.order.display_id}</span>
            ) : null
          ) : null}
          {quote.status === "expired" || quote.status === "closed" ? (
            <LocalizedClientLink href="/contact" className={secondaryButton}>
              Ask for a fresh quote
            </LocalizedClientLink>
          ) : null}
        </div>
      </div>

      {quote.mockups.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">Your proof</h2>
          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
            {quote.mockups.map((m) => (
              <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-200 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.label ?? "Proof"} className="aspect-square w-full object-contain" />
                {m.label ? <p className="mt-1 text-xs text-ui-fg-subtle">{m.label}</p> : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <DecorationList decorations={quote.decorations} />

      {quote.job_breakdown ? (
        <JobBreakdown breakdown={quote.job_breakdown} currency={quote.currency_code} />
      ) : quote.lines.length > 0 ? (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">What&apos;s in the quote</h2>
          <QuoteLines lines={quote.lines} currency={quote.currency_code} />
        </section>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-gray-200 pt-4">
        <span className="text-sm text-ui-fg-subtle">
          Total (inc GST){validity ? ` · ${validity}` : ""}
        </span>
        <span className="text-xl font-semibold text-ui-fg-base" data-testid="quote-total">
          {quote.total != null ? money(quote.total, quote.currency_code) : "Price to come"}
        </span>
      </div>
    </div>
  )
}

export default QuoteDetail

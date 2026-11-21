import { acceptMyQuote, type AccountQuote, type AccountQuoteLine } from "@lib/data/quotes-account"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import AcceptButton from "./accept-button"
import { STATUS_TONE, money, shortDate, unitPriceLabel, validityLabel } from "./format"

export const QuoteStatusBadge = ({ quote }: { quote: Pick<AccountQuote, "status" | "status_label"> }) => (
  <span
    className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[quote.status]}`}
    data-testid="quote-status"
  >
    {quote.status_label}
  </span>
)

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ui-border-base bg-white px-4 py-2.5 text-sm font-semibold text-ui-fg-base! hover:bg-ui-bg-subtle"

/** Garment rows of a quote: picture, name, sizes, quantity and (once sent) prices. */
export const QuoteLines = ({ lines, currency, limit }: { lines: AccountQuoteLine[]; currency: string; limit?: number }) => {
  const shown = limit ? lines.slice(0, limit) : lines
  return (
    <ul className="divide-y divide-gray-100">
      {shown.map((l, i) => (
        <li key={i} className="flex items-start gap-3 py-3">
          {l.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.thumbnail} alt="" className="h-14 w-14 flex-none rounded-md border border-gray-200 bg-white object-contain" />
          ) : (
            <div className="h-14 w-14 flex-none rounded-md border border-gray-200 bg-ui-bg-subtle" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ui-fg-base">{l.title}</p>
            {l.description ? <p className="whitespace-pre-line text-xs text-ui-fg-subtle">{l.description}</p> : null}
            <p className="text-xs text-ui-fg-subtle">
              {l.quantity > 0 ? `Qty ${l.quantity}` : null}
              {l.sizes ? ` · ${l.sizes}` : null}
              {l.unit_price != null ? ` · ${unitPriceLabel(l, currency)} each` : null}
            </p>
          </div>
          {l.total != null ? <p className="flex-none text-sm font-semibold text-ui-fg-base">{money(l.total, currency)}</p> : null}
        </li>
      ))}
      {limit && lines.length > limit ? (
        <li className="py-2 text-xs text-ui-fg-subtle">+ {lines.length - limit} more</li>
      ) : null}
    </ul>
  )
}

const QuotesList = ({ quotes, countryCode }: { quotes: AccountQuote[]; countryCode: string }) => {
  if (quotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ui-border-base p-8 text-center" data-testid="no-quotes">
        <p className="text-base font-semibold text-ui-fg-base">No quotes yet</p>
        <p className="mt-1 text-sm text-ui-fg-subtle">Ask for a quote, or download one from your cart, and it shows up here.</p>
        <LocalizedClientLink href="/contact" className={`${secondaryButton} mt-4`}>
          Ask for a quote
        </LocalizedClientLink>
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-4" data-testid="quotes-list">
      {quotes.map((q) => {
        const validity = validityLabel(q.status, q.expires_at)
        return (
          <li key={q.id} className="rounded-xl border border-ui-border-base bg-white p-4 small:p-5" data-testid="quote-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-ui-fg-base">{q.public_id}</p>
                <p className="text-xs text-ui-fg-subtle">
                  {shortDate(q.created_at)}
                  {q.subject ? ` · ${q.subject}` : ""}
                </p>
              </div>
              <QuoteStatusBadge quote={q} />
            </div>

            {q.lines.length > 0 ? <div className="mt-2"><QuoteLines lines={q.lines} currency={q.currency_code} limit={3} /></div> : null}

            <div className="mt-3 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
              <p className="text-sm text-ui-fg-base">
                {q.total != null ? (
                  <>
                    <span className="font-semibold">{money(q.total, q.currency_code)}</span> inc GST
                  </>
                ) : (
                  <span className="text-ui-fg-subtle">Price to come</span>
                )}
                {validity ? <span className="text-ui-fg-subtle"> · {validity}</span> : null}
                {q.order?.display_id ? <span className="text-ui-fg-subtle"> · Order #{q.order.display_id}</span> : null}
              </p>
              <div className="flex flex-col gap-2 tablet:flex-row">
                <LocalizedClientLink href={`/account/quotes/${q.id}`} className={secondaryButton} data-testid="quote-view-link">
                  View quote
                </LocalizedClientLink>
                {q.can_accept ? (
                  <form action={acceptMyQuote.bind(null, countryCode, q.id)} className="contents">
                    <AcceptButton />
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default QuotesList

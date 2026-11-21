import { Metadata } from "next"

import { listMyQuotes } from "@lib/data/quotes-account"
import QuotesList from "@modules/account/components/quotes"

export const metadata: Metadata = {
  title: "Quotes",
  description: "Your quotes from SC Prints.",
}

export default async function QuotesPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const [{ countryCode }, quotes] = await Promise.all([params, listMyQuotes()])
  return (
    <div className="w-full" data-testid="quotes-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--brand-primary)/80">Quotes</p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">My quotes</h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          Every quote we&apos;ve sent you. Accept one to turn it into an order.
        </p>
      </header>
      <QuotesList quotes={quotes} countryCode={countryCode} />
    </div>
  )
}

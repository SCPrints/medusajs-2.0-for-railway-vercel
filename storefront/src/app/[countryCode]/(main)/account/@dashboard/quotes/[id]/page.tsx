import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getMyQuote } from "@lib/data/quotes-account"
import QuoteDetail from "@modules/account/components/quotes/quote-detail"

export const metadata: Metadata = { title: "Quote" }

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string; id: string }>
  searchParams: Promise<{ accept?: string }>
}) {
  const [{ countryCode, id }, { accept }] = await Promise.all([params, searchParams])
  const quote = await getMyQuote(id)
  if (!quote) notFound()
  return (
    <div className="w-full" data-testid="quote-page-wrapper">
      <QuoteDetail quote={quote} countryCode={countryCode} acceptFailed={accept === "failed"} />
    </div>
  )
}

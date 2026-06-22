import { Metadata } from "next"

import ApprovalForm from "@modules/quote-approval/components/approval-form"
import { getQuoteApproval } from "@lib/data/quote-approval"

export const metadata: Metadata = {
  title: "Approve your design",
  description: "Review and approve your SC PRINTS design mockup.",
  robots: { index: false, follow: false },
}

type RouteParams = { countryCode: string; id: string }
type SearchParams = { sig?: string }

export default async function QuoteApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const { sig } = await searchParams

  const invalid = !sig || typeof sig !== "string" || sig.length < 16
  const state = invalid ? null : await getQuoteApproval(id, sig as string)

  if (!state) {
    return (
      <div className="content-container py-14 small:py-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
            Design approval
          </p>
          <h1 className="page-title-marketing mt-3 tracking-tight">
            Approval link expired
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ui-fg-subtle">
            This design-approval link is no longer valid. Please get in touch
            with our team and we&apos;ll send you a fresh one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="content-container py-14 small:py-20">
      <div className="mx-auto max-w-xl">
        <ApprovalForm quoteId={id} sig={sig as string} initial={state} />
      </div>
    </div>
  )
}

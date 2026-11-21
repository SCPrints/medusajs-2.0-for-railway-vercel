import { Metadata } from "next"

import { getMySpend } from "@lib/data/spend"
import SpendReport from "@modules/account/components/spend"

export const metadata: Metadata = {
  title: "Spend",
  description: "What you have spent with SC Prints, month by month, and a statement of invoices.",
}

export default async function SpendPage({ searchParams }: { searchParams: Promise<{ organisation?: string }> }) {
  const { organisation } = await searchParams
  // An organisation you can't report on falls back to your own orders.
  const data = (organisation ? await getMySpend(organisation) : null) ?? (await getMySpend())
  return (
    <div className="w-full" data-testid="spend-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--brand-primary)/80">Spend</p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">
          {data?.scope.type === "organisation" && data.scope.name ? `${data.scope.name} spend` : "My spend"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          What you&apos;ve spent each month, and a statement of invoices to download.
        </p>
      </header>
      {data ? (
        <SpendReport data={data} />
      ) : (
        <p className="text-sm text-ui-fg-subtle">We couldn&apos;t load your spend. Please refresh the page.</p>
      )}
    </div>
  )
}

import { Metadata } from "next"

import { getMyPriceList } from "@lib/data/prices"
import PriceListView from "@modules/account/components/prices"

export const metadata: Metadata = {
  title: "Prices",
  description: "Your prices by quantity for the garments you order.",
}

export default async function PricesPage() {
  const list = await getMyPriceList()
  return (
    <div className="w-full" data-testid="prices-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">Price list</p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">My prices</h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          Your price for each garment you order, by quantity, plus print and embroidery prices.
        </p>
      </header>
      {list ? (
        <PriceListView list={list} />
      ) : (
        <p className="text-sm text-ui-fg-subtle">We couldn&apos;t load your prices. Please refresh the page.</p>
      )}
    </div>
  )
}

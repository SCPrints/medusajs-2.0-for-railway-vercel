import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTeamStore } from "@lib/data/team-stores"
import ItemCard from "@modules/team-store/components/item-card"
import PasswordGate from "@modules/team-store/components/password-gate"
import StoreHeader from "@modules/team-store/components/store-header"

type Params = { params: Promise<{ countryCode: string; handle: string }> }

// Link-only stores (Decision 8): never indexed.
export const metadata: Metadata = { title: "Team store", robots: { index: false, follow: false } }

export default async function TeamStorePage({ params }: Params) {
  const { handle } = await params
  const result = await getTeamStore(handle)
  if (result.kind === "missing") notFound()
  if (result.kind === "password") {
    return (
      <div className="content-container">
        <PasswordGate handle={handle} title={result.title} wrong={result.wrong} />
      </div>
    )
  }
  const { store, items } = result.view

  return (
    <div className="content-container flex flex-col gap-6 py-8">
      <StoreHeader store={store} />
      {store.state === "open" ? (
        items.length ? (
          <div className="grid grid-cols-1 gap-4 phone:grid-cols-2 small:grid-cols-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} storeId={store.id} handle={store.handle} />
            ))}
          </div>
        ) : (
          <p className="text-ui-fg-subtle">Nothing is on sale yet.</p>
        )
      ) : store.state === "not_yet_open" ? (
        <p className="rounded-md bg-ui-bg-subtle p-4">
          This store isn&apos;t open yet{store.opens_at ? `. It opens ${new Date(store.opens_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" })}` : ""}.
        </p>
      ) : (
        <p className="rounded-md bg-ui-bg-subtle p-4">
          This store has closed. If you ordered, we&apos;ll email you as your order moves through production.
        </p>
      )}
    </div>
  )
}

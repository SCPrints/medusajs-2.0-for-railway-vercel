import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTeamStoreApproval } from "@lib/data/team-stores"
import ApproveForm from "@modules/team-store/components/approve-form"

type Params = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ sig?: string }>
}

export const metadata: Metadata = { title: "Approve your team store", robots: { index: false, follow: false } }

const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

/** The organiser checks every item once before the store opens (Decision 7). */
export default async function ApproveTeamStorePage({ params, searchParams }: Params) {
  const { handle } = await params
  const { sig } = await searchParams
  const data = sig ? await getTeamStoreApproval(handle, sig) : null
  if (!data) notFound()
  const { store, items } = data

  return (
    <div className="content-container flex max-w-3xl flex-col gap-6 py-8">
      <div>
        {store.organisation_name ? <p className="text-sm font-semibold uppercase tracking-wide text-ui-fg-subtle">{store.organisation_name}</p> : null}
        <h1 className="text-3xl font-semibold">{store.title}</h1>
        <p className="mt-2 text-ui-fg-subtle">
          Please check every item: garment, colour, artwork and price. Orders close{" "}
          {new Date(store.closes_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" })}.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 phone:flex-row">
            <div className="flex gap-2 overflow-x-auto">
              {(item.mockups.length ? item.mockups : item.thumbnail ? [item.thumbnail] : []).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="h-40 w-40 shrink-0 rounded-lg bg-ui-bg-subtle object-contain" />
              ))}
            </div>
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-ui-fg-subtle">{item.colour}</p>
              <p className="text-sm text-ui-fg-subtle">Sizes: {item.sizes.map((s) => s.size).join(", ")}</p>
              <p className="mt-1 font-semibold">{aud(item.unit_price)} each</p>
            </div>
          </div>
        ))}
      </div>
      {data.can_approve ? (
        <ApproveForm handle={handle} sig={sig!} />
      ) : (
        <p className="rounded-md bg-ui-bg-subtle p-4">
          {store.approved_at ? `Approved by ${store.approved_by_name ?? "you"}. Thanks!` : "This store isn't waiting for approval."}
        </p>
      )}
    </div>
  )
}

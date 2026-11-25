import { Metadata } from "next"

import { getPublicAllowance } from "@lib/data/org-ops"
import PickForm from "@modules/allowance/components/pick-form"

export const metadata: Metadata = {
  title: "Choose your sizes",
  robots: { index: false, follow: false },
}

export default async function AllowancePage({ params }: { params: Promise<{ countryCode: string; token: string }> }) {
  const { token } = await params
  const data = await getPublicAllowance(token)

  if (!data) {
    return (
      <div className="content-container py-14 small:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="page-title-marketing tracking-tight">This link isn&apos;t working</h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ui-fg-subtle">
            It may have closed, or the link was copied wrongly. Ask whoever sent it to you for a new one.
          </p>
        </div>
      </div>
    )
  }

  if (data.closed) {
    const nameOf = new Map(data.items.map((i) => [i.design_id, i.product_title ? `${i.name} (${i.product_title})` : i.name]))
    const chosen = data.submitted ? data.picks.filter((p) => p.quantity > 0) : []
    return (
      <div className="content-container py-10 small:py-16">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{data.allowance.name}</p>
          <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base">Hi {data.person.name}, choices have closed</h1>
          {chosen.length ? (
            <>
              <p className="mt-4 text-base text-ui-fg-subtle">You chose:</p>
              <ul className="mt-2 list-disc pl-5 text-base text-ui-fg-base">
                {chosen.map((p, i) => (
                  <li key={i}>
                    {p.quantity} × {nameOf.get(p.design_id) ?? "Item"}, size {p.size}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-base text-ui-fg-subtle">
                {data.allowance.delivery === "home" && data.address
                  ? `We'll post it to ${data.address.city} ${data.address.province} ${data.address.postal_code}. You don't need to do anything else.`
                  : "You don't need to do anything else."}
              </p>
            </>
          ) : (
            <p className="mt-4 text-base text-ui-fg-subtle">
              You didn&apos;t choose before it closed. Ask whoever sent you the link if you still need something.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="content-container py-10 small:py-16">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{data.allowance.name}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base">Hi {data.person.name}, choose your sizes</h1>
        <PickForm token={token} data={data} />
      </div>
    </div>
  )
}

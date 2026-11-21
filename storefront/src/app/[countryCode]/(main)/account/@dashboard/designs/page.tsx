import { Metadata } from "next"
import DesignsGrid, { type ShareableOrg } from "@modules/account/components/designs-grid"
import { listMyDesigns } from "@lib/data/designs"
import { listAllMyOrdersWithLines } from "@lib/data/orders"
import { listMyOrganisations } from "@lib/data/organisations"
import { groupPastOrderDesigns } from "@modules/order/lib/design-groups"

export const metadata: Metadata = {
  title: "My designs",
  description: "Saved designs and designs from past orders, ready to re-order.",
}

export default async function DesignsPage() {
  const [{ designs }, orders, memberships] = await Promise.all([
    listMyDesigns(),
    listAllMyOrdersWithLines(),
    listMyOrganisations(),
  ])

  // Grouped on the server so only the small card data reaches the browser,
  // not every order's full design payload.
  const pastDesigns = groupPastOrderDesigns(orders as Parameters<typeof groupPastOrderDesigns>[0])
  const organisations: ShareableOrg[] = memberships
    .filter((m) => m.organisation && (m.role === "owner" || m.role === "purchaser"))
    .map((m) => ({ id: m.organisation!.id, name: m.organisation!.name }))

  return (
    <div className="w-full" data-testid="designs-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          Saved work
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8">
          My designs
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          Everything you&apos;ve saved or ordered. Order the same again, tweak it,
          or put it on a different garment.
        </p>
      </header>
      <DesignsGrid designs={designs} pastDesigns={pastDesigns} organisations={organisations} />
    </div>
  )
}

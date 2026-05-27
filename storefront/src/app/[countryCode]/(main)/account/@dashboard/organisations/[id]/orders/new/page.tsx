import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import {
  getOrganisationDesigns,
  getOrganisationDestinations,
  getOrganisationDetail,
  getOrganisationInventory,
} from "@lib/data/organisations"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import NewOrderForm from "@modules/account/components/organisations/new-order-form"

export const metadata: Metadata = {
  title: "Place new order",
  description: "Restock approved designs across your destinations.",
}

type PageProps = {
  params: Promise<{ id: string; countryCode: string }>
}

export default async function NewOrderPage({ params }: PageProps) {
  const { id, countryCode } = await params

  const detail = await getOrganisationDetail(id)
  if (!detail) notFound()
  const { organisation, role } = detail

  if (role !== "owner" && role !== "purchaser") {
    redirect(`/${countryCode}/account/organisations/${id}`)
  }

  const [designs, destinations, inventory] = await Promise.all([
    getOrganisationDesigns(id),
    getOrganisationDestinations(id, { activeOnly: true }),
    getOrganisationInventory(id),
  ])

  const activeDestinations = destinations.filter((d) => d.is_active)

  return (
    <div className="w-full">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ui-fg-muted">
        <LocalizedClientLink
          href="/account/organisations"
          className="hover:text-ui-fg-base"
        >
          My organisations
        </LocalizedClientLink>
        <span aria-hidden>·</span>
        <LocalizedClientLink
          href={`/account/organisations/${id}`}
          className="hover:text-ui-fg-base"
        >
          {organisation.name}
        </LocalizedClientLink>
        <span aria-hidden>·</span>
        <span className="text-ui-fg-subtle">New order</span>
      </nav>

      <header className="mb-6 border-l-4 border-[var(--brand-secondary)] pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          New order
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">
          New order for {organisation.name}
        </h1>
      </header>

      {activeDestinations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          You don&apos;t have any active destinations yet. Contact SC Prints
          to add one before placing an order.
        </div>
      ) : inventory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          No SKUs are set up yet. Contact SC Prints to configure your catalog
          before placing an order.
        </div>
      ) : (
        <NewOrderForm
          orgId={id}
          countryCode={countryCode}
          designs={designs}
          destinations={destinations}
          inventory={inventory}
          role={role}
        />
      )}
    </div>
  )
}

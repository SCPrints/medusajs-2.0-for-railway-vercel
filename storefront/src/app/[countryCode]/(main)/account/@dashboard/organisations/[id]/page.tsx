import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCustomer } from "@lib/data/customer"
import {
  getOrganisationDesigns,
  getOrganisationDestinations,
  getOrganisationDetail,
  getOrganisationInventory,
  getOrganisationMembers,
  getOrganisationOrders,
} from "@lib/data/organisations"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import OrgTabs from "@modules/account/components/organisations/org-tabs"
import OverviewTab from "@modules/account/components/organisations/tab-overview"
import DesignsTab from "@modules/account/components/organisations/tab-designs"
import InventoryTab from "@modules/account/components/organisations/tab-inventory"
import DestinationsTab from "@modules/account/components/organisations/tab-destinations"
import OrdersTab from "@modules/account/components/organisations/tab-orders"
import MembersTab from "@modules/account/components/organisations/tab-members"

export const metadata: Metadata = {
  title: "Organisation",
  description: "Organisation portal — designs, inventory, orders.",
}

type PageProps = {
  params: Promise<{ id: string; countryCode: string }>
}

export default async function OrgDetailPage({ params }: PageProps) {
  const { id } = await params

  const [detail, customer] = await Promise.all([
    getOrganisationDetail(id),
    getCustomer(),
  ])

  if (!detail || !customer) {
    notFound()
  }

  const { organisation, role } = detail

  // Fetch tab data in parallel
  const [designs, destinations, inventory, ordersResult, members] =
    await Promise.all([
      getOrganisationDesigns(id),
      getOrganisationDestinations(id),
      getOrganisationInventory(id),
      getOrganisationOrders(id, { limit: 30 }),
      role === "owner"
        ? getOrganisationMembers(id)
        : Promise.resolve([]),
    ])

  const canManageMembers = role === "owner"

  return (
    <div className="w-full">
      <nav className="mb-4 flex items-center gap-2 text-xs text-ui-fg-muted">
        <LocalizedClientLink
          href="/account/organisations"
          className="hover:text-ui-fg-base"
        >
          My organisations
        </LocalizedClientLink>
        <span aria-hidden>·</span>
        <span className="text-ui-fg-subtle">{organisation.name}</span>
      </nav>

      <header className="mb-6 border-l-4 border-[var(--brand-secondary)] pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Organisation
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ui-fg-base small:text-3xl">
            {organisation.name}
          </h1>
          <p className="text-xs text-ui-fg-muted">
            Your role:{" "}
            <span className="font-semibold text-ui-fg-subtle">
              {role === "owner"
                ? "Owner"
                : role === "purchaser"
                ? "Purchaser"
                : "Viewer"}
            </span>
          </p>
        </div>
        {organisation.notes ? (
          <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm text-ui-fg-subtle">
            {organisation.notes}
          </p>
        ) : null}
      </header>

      <OrgTabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "designs", label: "Designs", badge: designs.length },
          { key: "inventory", label: "Inventory", badge: inventory.length },
          {
            key: "destinations",
            label: "Destinations",
            badge: destinations.length,
          },
          { key: "orders", label: "Orders", badge: ordersResult.count },
          {
            key: "members",
            label: "Members",
            badge: members.length,
            gated: !canManageMembers,
          },
        ]}
        panels={{
          overview: (
            <OverviewTab
              orgId={id}
              designs={designs}
              destinations={destinations}
              inventory={inventory}
              recentOrders={ordersResult.orders}
              role={role}
            />
          ),
          designs: <DesignsTab designs={designs} inventory={inventory} />,
          inventory: (
            <InventoryTab inventory={inventory} designs={designs} />
          ),
          destinations: (
            <DestinationsTab destinations={destinations} />
          ),
          orders: (
            <OrdersTab
              orgId={id}
              orders={ordersResult.orders}
              destinations={destinations}
              count={ordersResult.count}
            />
          ),
          members: canManageMembers ? (
            <MembersTab
              orgId={id}
              members={members}
              meCustomerId={customer.id}
            />
          ) : null,
        }}
      />
    </div>
  )
}

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
import { getOrganisationRange, getOrganisationRoster } from "@lib/data/org-team"
import { knownSizesByGroup } from "@lib/util/size-list"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import OrgTabs from "@modules/account/components/organisations/org-tabs"
import OverviewTab from "@modules/account/components/organisations/tab-overview"
import DesignsTab from "@modules/account/components/organisations/tab-designs"
import InventoryTab from "@modules/account/components/organisations/tab-inventory"
import DestinationsTab from "@modules/account/components/organisations/tab-destinations"
import OrdersTab from "@modules/account/components/organisations/tab-orders"
import MembersTab from "@modules/account/components/organisations/tab-members"
import AccountTab from "@modules/account/components/organisations/tab-account"
import ApprovalsTab from "@modules/account/components/organisations/tab-approvals"
import InvoicesTab from "@modules/account/components/organisations/tab-invoices"
import PeopleTab from "@modules/account/components/organisations/tab-people"
import RangeTab from "@modules/account/components/organisations/tab-range"
import AllowanceTab from "@modules/account/components/organisations/tab-allowance"
import BrandKitTab from "@modules/account/components/organisations/tab-brand-kit"

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

  // Our range + People: started now, awaited after the other tab data.
  const teamData = Promise.all([getOrganisationRange(id), getOrganisationRoster(id)])

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
  const [range, roster] = await teamData

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

      <header className="mb-6 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          Organisation
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8">
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
      </header>

      <OrgTabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "range", label: "Our range", badge: range.items.length },
          { key: "people", label: "People", badge: roster.members.length },
          { key: "allowance", label: "Uniform allowance", gated: role === "viewer" },
          // Staff-added artwork for the stock order form. Most organisations
          // never have any (their designs live in Our range), so hide it empty.
          { key: "designs", label: "Approved artwork", badge: designs.length, gated: designs.length === 0 },
          // Stock we hold for the organisation: hidden when there's none.
          { key: "inventory", label: "Inventory", badge: inventory.length, gated: inventory.length === 0 },
          {
            key: "destinations",
            label: "Destinations",
            badge: destinations.length,
          },
          { key: "orders", label: "Orders", badge: ordersResult.count },
          // Buying on account. These tabs load their own (live) figures.
          { key: "approvals", label: "Drafts & approvals", gated: role === "viewer" },
          { key: "invoices", label: "Invoices" },
          { key: "brand_kit", label: "Brand kit" },
          { key: "account", label: "Account" },
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
              rangeCount={range.items.length}
              designs={designs}
              destinations={destinations}
              inventory={inventory}
              recentOrders={ordersResult.orders}
              role={role}
            />
          ),
          range: <RangeTab orgId={id} orgName={organisation.name} range={range} roster={roster} />,
          people: <PeopleTab orgId={id} roster={roster} knownSizes={knownSizesByGroup(range.items)} />,
          allowance: <AllowanceTab orgId={id} range={range} roster={roster} />,
          brand_kit: <BrandKitTab orgId={id} />,
          designs: <DesignsTab designs={designs} inventory={inventory} />,
          inventory: (
            <InventoryTab orgId={id} inventory={inventory} designs={designs} />
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
          approvals: <ApprovalsTab orgId={id} />,
          invoices: <InvoicesTab orgId={id} />,
          account: <AccountTab orgId={id} role={role} />,
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

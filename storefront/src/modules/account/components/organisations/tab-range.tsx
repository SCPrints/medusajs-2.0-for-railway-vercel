"use client"

import { useEffect, useMemo, useState } from "react"

import { getOrganisationRoster, type OrgRange, type OrgRoster, type RosterMember } from "@lib/data/org-team"
import { knownSizesByGroup } from "@lib/util/size-list"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import RangeOrderForm from "./range-order-form"

type Props = {
  orgId: string
  orgName: string
  range: OrgRange
  roster: OrgRoster
}

/**
 * "Our range": every saved design shared with the organisation, with the
 * artwork already on the garment — as an order form (type quantities, add
 * the lot) or as a gallery.
 */
export default function RangeTab({ orgId, orgName, range, roster }: Props) {
  const [view, setView] = useState<"order" | "gallery">(range.can_order ? "order" : "gallery")
  const [members, setMembers] = useState<RosterMember[]>(roster.members)
  const knownSizes = useMemo(() => knownSizesByGroup(range.items), [range.items])

  // People may have been edited on the People tab since the page loaded.
  useEffect(() => {
    let live = true
    void getOrganisationRoster(orgId).then((r) => {
      if (live && r.garment_groups.length) setMembers(r.members)
    })
    return () => {
      live = false
    }
  }, [orgId])

  if (range.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ui-border-base bg-white p-8 text-center">
        <p className="text-base font-semibold text-ui-fg-base">Nothing in your range yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ui-fg-subtle">
          Save a design in the Studio, then share it with {orgName} from My designs. It shows up here, ready to order
          in any size.
        </p>
        <LocalizedClientLink
          href="/account/designs"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-[var(--brand-secondary)]/90"
        >
          Go to My designs
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ui-fg-base">Our range</h2>
          <p className="mt-1 text-sm text-ui-fg-subtle">
            {view === "order"
              ? "Type how many of each size, then add the lot to your cart."
              : "Your approved garments, artwork already on."}
          </p>
        </div>
        {range.can_order ? (
          <div className="inline-flex rounded-full border border-ui-border-base bg-white p-1" role="group" aria-label="View">
            {(["order", "gallery"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition ${
                  view === v ? "bg-ink text-white" : "text-ui-fg-subtle hover:text-ui-fg-base"
                }`}
              >
                {v === "order" ? "Order form" : "Gallery"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {view === "order" && range.can_order ? (
        <RangeOrderForm
          orgId={orgId}
          items={range.items}
          packingOptions={range.packing_options}
          members={members}
          groups={roster.garment_groups}
          knownSizes={knownSizes}
          canEditRoster={roster.can_edit}
          onRosterChange={setMembers}
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 phone:grid-cols-3 small:grid-cols-4">
          {range.items.map((item) => {
            const image = item.thumbnail_url ?? item.product?.thumbnail
            const href = item.product?.handle ? `/products/${item.product.handle}?design=${item.design_id}` : null
            const body = (
              <>
                <span className="flex aspect-square w-full items-center justify-center bg-ui-bg-subtle">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-ui-fg-muted">No picture</span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 px-3 py-3">
                  <span className="text-sm font-semibold text-ui-fg-base">{item.name}</span>
                  <span className="text-xs text-ui-fg-muted">{item.product?.title ?? "Garment no longer available"}</span>
                  {item.colours.length > 1 ? (
                    <span className="text-xs text-ui-fg-muted">{item.colours.length} colours</span>
                  ) : null}
                  {href ? <span className="mt-1 text-xs font-semibold text-ui-fg-interactive">Open in the Studio</span> : null}
                </span>
              </>
            )
            const card =
              "flex h-full flex-col overflow-hidden rounded-2xl border border-ui-border-base bg-white text-left transition hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
            return (
              <li key={item.design_id}>
                {href ? (
                  <LocalizedClientLink href={href} className={card}>
                    {body}
                  </LocalizedClientLink>
                ) : (
                  <div className={card}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

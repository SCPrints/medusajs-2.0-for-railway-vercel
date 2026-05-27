"use client"

import { useState } from "react"
import type { OrganisationDestination } from "@lib/data/organisations"

type Props = { destinations: OrganisationDestination[] }

export default function DestinationsTab({ destinations }: Props) {
  const [active, setActive] = useState<OrganisationDestination | null>(null)
  const active_only = destinations.filter((d) => d.is_active)

  if (destinations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ui-border-base bg-white p-10 text-center">
        <p className="text-sm text-ui-fg-subtle">
          No destinations on file yet. SC Prints sets these up — contact us to
          add one.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-ui-border-base bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-xs uppercase tracking-[0.08em] text-ui-fg-muted">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Name</th>
              <th className="hidden px-3 py-3 text-left font-semibold tablet:table-cell">
                City
              </th>
              <th className="px-3 py-3 text-left font-semibold">Active</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-border-base">
            {destinations.map((d) => (
              <tr key={d.id} className="hover:bg-ui-bg-subtle">
                <td className="px-3 py-3 align-middle text-ui-fg-base">
                  {d.name}
                  <span className="block text-xs text-ui-fg-muted tablet:hidden">
                    {d.city}
                  </span>
                </td>
                <td className="hidden px-3 py-3 align-middle text-ui-fg-subtle tablet:table-cell">
                  {d.city}
                </td>
                <td className="px-3 py-3 align-middle">
                  {d.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-ui-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setActive(d)}
                    className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline min-h-11 px-2"
                  >
                    Details →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 rounded-2xl border border-dashed border-ui-border-base bg-white p-4 text-sm text-ui-fg-subtle">
        Need to add or change a destination? Contact SC Prints and we&apos;ll
        set it up. (You have {active_only.length} active.)
      </p>

      {active ? (
        <DestModal destination={active} onClose={() => setActive(null)} />
      ) : null}
    </div>
  )
}

function DestModal({
  destination,
  onClose,
}: {
  destination: OrganisationDestination
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={destination.name}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-3">
          <h3 className="text-base font-semibold text-ui-fg-base">
            {destination.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ui-fg-subtle hover:bg-ui-bg-subtle"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
              Address
            </p>
            <p className="mt-1 text-ui-fg-base">{destination.address_1}</p>
            {destination.address_2 ? (
              <p className="text-ui-fg-base">{destination.address_2}</p>
            ) : null}
            <p className="text-ui-fg-base">
              {destination.city}
              {destination.province ? `, ${destination.province}` : ""}{" "}
              {destination.postal_code}
            </p>
            <p className="text-ui-fg-base">
              {(destination.country_code ?? "AU").toUpperCase()}
            </p>
          </div>

          {(destination.contact_name ||
            destination.contact_phone ||
            destination.contact_email) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                Contact
              </p>
              <p className="mt-1 text-ui-fg-base">
                {destination.contact_name ?? "—"}
              </p>
              {destination.contact_phone ? (
                <p className="text-ui-fg-base">{destination.contact_phone}</p>
              ) : null}
              {destination.contact_email ? (
                <p className="text-ui-fg-base">{destination.contact_email}</p>
              ) : null}
            </div>
          )}

          {destination.delivery_notes ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                Delivery notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-ui-fg-base">
                {destination.delivery_notes}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

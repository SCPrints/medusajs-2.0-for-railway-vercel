"use client"

import { useState, useTransition } from "react"
import { useParams, useRouter } from "next/navigation"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import GarmentPicker from "@modules/account/components/garment-picker"
import OrderAgainButton from "@modules/order/components/order-again-button"
import {
  deleteMyDesign,
  renameMyDesign,
  shareMyDesign,
  type SavedDesign,
} from "@lib/data/designs"
import type { PastOrderDesign } from "@modules/order/lib/design-groups"
import { phCapture } from "@lib/posthog"

export type ShareableOrg = { id: string; name: string }

type Props = {
  designs: SavedDesign[]
  pastDesigns?: PastOrderDesign[]
  /** Orgs I can share into (role owner or purchaser). Empty hides sharing. */
  organisations?: ShareableOrg[]
}

const formatDate = (iso: string): string => {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ""
  return new Date(ts).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const BTN =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60"
const BTN_PRIMARY = `${BTN} bg-ink text-white hover:opacity-90`
const BTN_SECONDARY = `${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`

/** Studio link for a saved design, on its own garment or another one. */
const designHref = (designId: string, handle: string | null | undefined) =>
  handle
    ? `/products/${handle}?design=${encodeURIComponent(designId)}`
    : `/customizer?design=${encodeURIComponent(designId)}`

const reorderHref = (handle: string | null, orderId: string, lineId: string) => {
  const reorder = encodeURIComponent(`${orderId}:${lineId}`)
  return handle ? `/products/${handle}?reorder=${reorder}` : `/customizer?reorder=${reorder}`
}

const CardImage = ({ src, alt }: { src: string | null; alt: string }) => (
  <div className="flex aspect-square items-center justify-center bg-ui-bg-subtle">
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" />
    ) : (
      <span className="text-sm text-ui-fg-subtle">No preview</span>
    )}
  </div>
)

const EmptyState = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-ui-border-base p-10 text-center">
    <h2 className="mb-2 text-lg font-semibold">{title}</h2>
    <p className="mb-6 text-sm text-ui-fg-subtle">{body}</p>
    <LocalizedClientLink
      href="/store"
      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
    >
      Pick a garment to design on
    </LocalizedClientLink>
  </div>
)

const SavedDesigns = ({
  designs,
  organisations,
  onPickGarment,
}: {
  designs: SavedDesign[]
  organisations: ShareableOrg[]
  onPickGarment: (designId: string) => void
}) => {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [, startTransition] = useTransition()

  if (!designs.length) {
    return (
      <EmptyState
        title="No saved designs yet"
        body="Hit “Save to my designs” in the Studio and it’ll appear here, ready to re-edit or re-order."
      />
    )
  }

  const refresh = () => startTransition(() => router.refresh())

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved design? This can’t be undone.")) return
    setError(null)
    setBusyId(id)
    const res = await deleteMyDesign(id)
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    phCapture("design_deleted", { design_id: id })
    refresh()
  }

  const handleSubmitRename = async (id: string, current: string) => {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!name || name === current) return
    setError(null)
    setBusyId(id)
    const res = await renameMyDesign(id, name)
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    phCapture("design_renamed", { design_id: id })
    refresh()
  }

  const handleShare = async (id: string, orgId: string | null) => {
    setError(null)
    setBusyId(id)
    const res = await shareMyDesign(id, orgId)
    setBusyId(null)
    if (!res.ok) return setError(res.error)
    phCapture("design_shared", { design_id: id, shared: Boolean(orgId) })
    refresh()
  }

  return (
    <div className="flex flex-col gap-y-4">
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 phone:grid-cols-2 large:grid-cols-3">
        {designs.map((design) => {
          const isBusy = busyId === design.id
          const isRenaming = renamingId === design.id
          const canEdit = design.can_edit !== false
          return (
            <li
              key={design.id}
              className="flex flex-col overflow-hidden rounded-xl border border-ui-border-base bg-white"
              data-testid="design-card"
            >
              <div className="relative">
                <CardImage src={design.thumbnail_url} alt={design.name} />
                {design.shared_from ? (
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ui-fg-base shadow-xs">
                    Shared by {design.shared_from.organisation_name}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-y-2 p-4">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => handleSubmitRename(design.id, design.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleSubmitRename(design.id, design.name)
                      }
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                    aria-label="Design name"
                    className="min-h-11 rounded-sm border border-ui-border-base px-2 text-base font-semibold focus:outline-hidden focus:ring-2 focus:ring-ink"
                    maxLength={120}
                    disabled={isBusy}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ui-fg-base">{design.name}</p>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(design.id)
                          setRenameDraft(design.name)
                        }}
                        className="-my-2 inline-flex min-h-11 shrink-0 items-center px-1 text-xs text-ui-fg-subtle underline underline-offset-2 hover:text-ui-fg-base"
                      >
                        Rename
                      </button>
                    ) : null}
                  </div>
                )}
                <p className="text-xs text-ui-fg-subtle">Updated {formatDate(design.updated_at)}</p>

                {canEdit && organisations.length > 0 ? (
                  <label className="flex items-center gap-2 text-xs text-ui-fg-subtle">
                    <span className="shrink-0">Share with</span>
                    <select
                      value={design.organisation_id ?? ""}
                      disabled={isBusy}
                      onChange={(e) => handleShare(design.id, e.target.value || null)}
                      className="min-h-11 flex-1 rounded-md border border-ui-border-base bg-white px-2 text-sm text-ui-fg-base"
                    >
                      <option value="">Just me</option>
                      {organisations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <LocalizedClientLink
                    href={designHref(design.id, design.base_product_handle)}
                    className={BTN_PRIMARY}
                  >
                    Edit &amp; order
                  </LocalizedClientLink>
                  <button type="button" className={BTN_SECONDARY} onClick={() => onPickGarment(design.id)}>
                    Put on another garment
                  </button>
                  <LocalizedClientLink
                    href={`/account/designs/${design.id}/group-order`}
                    className={BTN_SECONDARY}
                  >
                    Use for a group order
                  </LocalizedClientLink>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(design.id)}
                      disabled={isBusy}
                      className="min-h-11 text-xs text-ui-fg-subtle hover:text-red-600 disabled:opacity-60"
                    >
                      {isBusy ? "Working…" : "Delete"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const PastDesigns = ({
  designs,
  onPickGarment,
}: {
  designs: PastOrderDesign[]
  onPickGarment: (d: PastOrderDesign) => void
}) => {
  if (!designs.length) {
    return (
      <EmptyState
        title="No past orders yet"
        body="Designs from your orders show up here so you can order the same again in one click."
      />
    )
  }
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 phone:grid-cols-2 large:grid-cols-3">
      {designs.map((d) => (
        <li
          key={d.key}
          className="flex flex-col overflow-hidden rounded-xl border border-ui-border-base bg-white"
          data-testid="past-design-card"
        >
          <CardImage src={d.mockupUrl ?? d.thumbnail} alt={d.productTitle} />
          <div className="flex flex-1 flex-col gap-y-1 p-4">
            <p className="text-sm font-semibold text-ui-fg-base">{d.productTitle}</p>
            <p className="text-xs text-ui-fg-subtle">
              Ordered {d.orderCount === 1 ? "once" : `${d.orderCount} times`} · {d.totalQty}{" "}
              {d.totalQty === 1 ? "piece" : "pieces"} · last {formatDate(d.lastOrderedAt)}
            </p>
            <div className="mt-auto flex flex-col gap-2 pt-3">
              <OrderAgainButton orderId={d.latestOrderId} lineIds={d.latestLineIds} />
              <LocalizedClientLink
                href={reorderHref(d.productHandle, d.latestOrderId, d.latestLineId)}
                className={BTN_SECONDARY}
              >
                Change &amp; re-order
              </LocalizedClientLink>
              <button type="button" className={BTN_SECONDARY} onClick={() => onPickGarment(d)}>
                Put on another garment
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

const DesignsGrid = ({ designs, pastDesigns = [], organisations = [] }: Props) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  // Land on whichever tab has something in it.
  const [tab, setTab] = useState<"saved" | "past">(
    designs.length === 0 && pastDesigns.length > 0 ? "past" : "saved"
  )
  const [picker, setPicker] = useState<
    { kind: "saved"; id: string } | { kind: "past"; design: PastOrderDesign } | null
  >(null)

  const tabs = [
    { id: "saved" as const, label: "Saved", count: designs.length },
    { id: "past" as const, label: "From past orders", count: pastDesigns.length },
  ]

  return (
    <div className="flex flex-col gap-y-5">
      <div role="tablist" aria-label="Designs" className="flex gap-1 rounded-lg bg-ui-bg-subtle p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={[
              "min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition",
              tab === t.id ? "bg-white text-ui-fg-base shadow-xs" : "text-ui-fg-subtle hover:text-ui-fg-base",
            ].join(" ")}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-normal text-ui-fg-subtle">{t.count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "saved" ? (
          <SavedDesigns
            designs={designs}
            organisations={organisations}
            onPickGarment={(id) => setPicker({ kind: "saved", id })}
          />
        ) : (
          <PastDesigns designs={pastDesigns} onPickGarment={(design) => setPicker({ kind: "past", design })} />
        )}
      </div>

      <GarmentPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        title="Put this design on another garment"
        onPick={(p) => {
          const target = picker
          setPicker(null)
          if (!target) return
          const href =
            target.kind === "saved"
              ? designHref(target.id, p.handle)
              : reorderHref(p.handle, target.design.latestOrderId, target.design.latestLineId)
          phCapture("design_other_garment_picked", { kind: target.kind, product_handle: p.handle })
          router.push(`/${countryCode}${href}`)
        }}
      />
    </div>
  )
}

export default DesignsGrid

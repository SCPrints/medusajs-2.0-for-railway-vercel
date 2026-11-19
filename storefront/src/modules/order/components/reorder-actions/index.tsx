"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import { phCapture } from "@lib/posthog"
import { requestReorder } from "@lib/data/orders"
import LineItemMockupPreview from "@modules/customizer/components/line-item-mockup-preview"
import {
  getCustomizerMockupArtifacts,
  getCustomizerMockupUrls,
} from "@modules/customizer/lib/metadata"
import GarmentPicker from "@modules/account/components/garment-picker"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderAgainButton from "@modules/order/components/order-again-button"
import {
  groupOrderLinesByDesign,
  hasApprovedProof,
  isStudioLine,
  type AnyLineItem,
} from "@modules/order/lib/design-groups"

type Props = {
  order: HttpTypes.StoreOrder
}

const BTN =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition tablet:w-auto"
const BTN_SECONDARY = `${BTN} border border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle`

const formatQuantitySummary = (lines: AnyLineItem[], totalQty: number): string => {
  const variantCount = lines.length
  return `${totalQty} ${totalQty === 1 ? "piece" : "pieces"} across ${variantCount} ${
    variantCount === 1 ? "variant" : "variants"
  }`
}

// ponytail: setup-fee / vectorization lines ride along with their design and
// aren't something to "re-order" on their own. Title match is a heuristic;
// switch to a metadata flag if those lines ever get one.
const isServiceLine = (line: AnyLineItem) =>
  Boolean((line.metadata as Record<string, unknown> | null)?.vectorization_for_order) ||
  /\b(setup|set-up|vectori[sz]ation)\b/i.test(line.title ?? "")

const studioHref = (handle: string | null, orderId: string, lineId: string) => {
  const reorder = encodeURIComponent(`${orderId}:${lineId}`)
  return handle ? `/products/${handle}?reorder=${reorder}` : `/customizer?reorder=${reorder}`
}

const AskUsToReorder = ({ orderId, lines }: { orderId: string; lines: AnyLineItem[] }) => {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobRef, setJobRef] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    const res = await requestReorder(orderId, lines.map((l) => l.id), note)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    phCapture("reorder_request_sent", { order_id: orderId, from: "order_page" })
    setJobRef(res.public_id)
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-white p-4" data-testid="reorder-request">
      <h3 className="text-sm font-semibold text-ui-fg-base">Items our team will re-order for you</h3>
      <p className="mt-1 text-xs text-ui-fg-subtle">
        These were set up by our team, so we&apos;ll put them together and email you a quote.
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
        {lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ui-fg-base">
              {line.product_title || line.title}
              {line.variant_title ? (
                <span className="text-ui-fg-subtle"> · {line.variant_title}</span>
              ) : null}
            </span>
            <span className="whitespace-nowrap text-xs text-ui-fg-subtle">Qty {line.quantity}</span>
          </li>
        ))}
      </ul>
      {jobRef ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          Thanks! Your job reference is <strong>{jobRef}</strong>. We&apos;ll email you a quote
          shortly.
        </p>
      ) : (
        <>
          <label className="mt-4 block text-xs font-medium text-ui-fg-subtle" htmlFor={`reorder-note-${orderId}`}>
            Anything to change? (optional)
          </label>
          <textarea
            id={`reorder-note-${orderId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="e.g. same again but 20 more, and add a size 3XL"
            className="mt-1 w-full rounded-md border border-ui-border-base px-3 py-2 text-base tablet:text-sm focus:outline-none focus:ring-2 focus:ring-ink"
          />
          {error ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex tablet:justify-end">
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className={`${BTN} bg-ink text-white hover:opacity-90 disabled:opacity-60`}
            >
              {busy ? "Sending…" : "Ask us to re-order"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const ReorderActions = ({ order }: Props) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const items = order.items ?? []
  const groups = groupOrderLinesByDesign(items)
  const staffLines = items.filter((l) => !isStudioLine(l) && !isServiceLine(l))
  if (!groups.length && !staffLines.length) return null

  const revisedProofs = (order.metadata as Record<string, unknown> | null)?.revised_proofs

  return (
    <section className="rounded-xl bg-ui-bg-subtle p-5" data-testid="reorder-actions">
      <div className="mb-4 flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
        <div>
          <h2 className="mb-1 text-base font-semibold text-ui-fg-base">Re-order</h2>
          <p className="text-sm text-ui-fg-subtle">
            Same again in one click, or change sizes, colours or the garment first.
          </p>
        </div>
        {groups.length > 1 ? (
          <OrderAgainButton
            orderId={order.id}
            label="Order again (whole order)"
            className="w-full tablet:w-auto"
          />
        ) : null}
      </div>

      <ul className="m-0 flex list-none flex-col gap-y-3 p-0">
        {groups.map((group) => {
          const line = group.representativeLine
          const lineIds = group.lines.map((l) => l.id)
          const showVariantsCollapsed = group.lines.length > 5
          const approved = hasApprovedProof(revisedProofs, lineIds)

          return (
            <li
              key={group.fingerprint}
              className="overflow-hidden rounded-xl border border-ui-border-base bg-white"
              data-testid="reorder-design-card"
            >
              <div className="flex flex-col gap-4 p-4 tablet:flex-row tablet:items-start">
                <div className="w-full tablet:w-32 tablet:flex-shrink-0">
                  <LineItemMockupPreview
                    mockups={getCustomizerMockupArtifacts(line)}
                    mockupUrls={getCustomizerMockupUrls(line)}
                    productThumbnail={line.thumbnail}
                    size="square"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ui-fg-base">{group.productTitle}</p>
                  <p className="mt-0.5 text-xs text-ui-fg-subtle">
                    {formatQuantitySummary(group.lines, group.totalQty)}
                  </p>
                  {approved ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M13.5 4.5 6 12l-3.5-3.5" />
                      </svg>
                      Uses the artwork our team approved
                    </p>
                  ) : null}

                  <details className="group mt-3" open={!showVariantsCollapsed}>
                    <summary
                      className={[
                        "cursor-pointer list-none select-none text-xs text-ui-fg-subtle hover:text-ui-fg-base",
                        showVariantsCollapsed ? "" : "hidden",
                      ].join(" ")}
                    >
                      <span className="group-open:hidden">Show {group.lines.length} variants</span>
                      <span className="hidden group-open:inline">Hide variants</span>
                    </summary>
                    <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 tablet:grid-cols-2">
                      {group.lines.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-2 text-xs text-ui-fg-base">
                          <span className="truncate">{l.variant_title || "Default"}</span>
                          <span className="whitespace-nowrap text-ui-fg-subtle">Qty {l.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-ui-border-base bg-ui-bg-subtle/40 px-4 py-3 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:justify-end">
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => setPickerFor(line.id)}
                  data-testid="reorder-other-garment"
                >
                  Put on another garment
                </button>
                <LocalizedClientLink
                  href={studioHref(group.productHandle, order.id, line.id)}
                  className={BTN_SECONDARY}
                  data-testid="reorder-design-link"
                  onClick={() =>
                    phCapture("reorder_design_clicked", {
                      order_id: order.id,
                      product_title: group.productTitle,
                      total_qty: group.totalQty,
                    })
                  }
                >
                  Change &amp; re-order
                </LocalizedClientLink>
                <OrderAgainButton orderId={order.id} lineIds={lineIds} className="w-full tablet:w-auto" />
              </div>
            </li>
          )
        })}
      </ul>

      {staffLines.length ? (
        <div className={groups.length ? "mt-4" : ""}>
          <AskUsToReorder orderId={order.id} lines={staffLines} />
        </div>
      ) : null}

      <GarmentPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title="Put this design on another garment"
        onPick={(p) => {
          const lineId = pickerFor
          setPickerFor(null)
          if (!lineId) return
          phCapture("reorder_other_garment_picked", { order_id: order.id, product_handle: p.handle })
          router.push(`/${countryCode}${studioHref(p.handle, order.id, lineId)}`)
        }}
      />
    </section>
  )
}

export default ReorderActions

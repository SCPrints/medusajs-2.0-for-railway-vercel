import { Badge, Button, Text } from "@medusajs/ui"
import { useState } from "react"

import {
  PACKING_LABEL_HEADERS,
  ROSTER_GARMENT_GROUPS,
  packingLabel,
  packingLabelRows,
  teamOrderFromMetadata,
} from "../../../lib/roster"
import { buildCsv, downloadCsv } from "../../lib/reports/csv"
import { namesNumbersLabel } from "../../../lib/names-numbers"
import { isSizingKitLine, sizingKitReturnBy } from "../../../lib/sizing-kit"

const SHOW = 12

/**
 * Team order details in the job's Delivery section: how to pack it, who it is
 * for (the roster the customer attached), and whether they asked for names /
 * numbers. Reads `order.metadata` only (stamped by
 * subscribers/order-placed-stamp-team-order.ts); renders nothing on an
 * ordinary order.
 */
export function TeamOrder({ order }: { order: { display_id?: number | null; metadata?: Record<string, unknown> | null } }) {
  const [all, setAll] = useState(false)
  const team = teamOrderFromMetadata(order.metadata)
  if (!team.roster && !team.packing && !team.personalisation_requested) return null

  const rows = packingLabelRows(team.roster, team.packing)
  const shown = all ? rows : rows.slice(0, SHOW)
  return (
    <div className="flex flex-col gap-y-2 border-t border-ui-border-base px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="small" weight="plus">Packing: {packingLabel(team.packing)}</Text>
        {team.names_numbers ? (
          <Badge color="green">Paid: {namesNumbersLabel(team.names_numbers)}</Badge>
        ) : team.personalisation_requested ? (
          <Badge color="orange">Names / numbers asked for — price before printing</Badge>
        ) : null}
        {rows.length ? (
          <Button
            size="small"
            variant="secondary"
            className="ml-auto"
            onClick={() => downloadCsv(`packing-labels-${order.display_id ?? "order"}.csv`, buildCsv(PACKING_LABEL_HEADERS, rows))}
          >
            Print packing labels (CSV)
          </Button>
        ) : null}
      </div>
      {rows.length ? (
        <>
          <table className="w-full text-left text-xs">
            <thead className="text-ui-fg-subtle">
              <tr>
                <th className="py-1 pr-2 font-medium">Name</th>
                <th className="py-1 pr-2 font-medium">Unit / team</th>
                <th className="py-1 pr-2 font-medium">No.</th>
                {ROSTER_GARMENT_GROUPS.map((g) => (
                  <th key={g.key} className="py-1 pr-2 font-medium">{g.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="border-t border-ui-border-base">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-2">{cell || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {team.roster?.total} {team.roster?.total === 1 ? "person" : "people"}
            {team.roster?.truncated ? ` (first ${rows.length} kept on the order — ask the customer for the full list)` : ""}
            {rows.length > SHOW ? (
              <button type="button" className="ml-2 text-ui-fg-interactive" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : "Show all"}
              </button>
            ) : null}
          </Text>
        </>
      ) : null}
    </div>
  )
}

/**
 * Sizing-kit lines on the order (lib/sizing-kit.ts): the garments to refund
 * when the kit comes back by the return-by date. Renders nothing otherwise.
 */
export function SizingKitNote({
  order,
}: {
  order: { created_at?: string | Date | null; items?: Array<{ id: string; title?: string | null; variant_title?: string | null; metadata?: Record<string, unknown> | null }> | null }
}) {
  const kit = (order.items ?? []).filter((i) => isSizingKitLine(i.metadata))
  if (!kit.length) return null
  const due = order.created_at ? sizingKitReturnBy(order.created_at) : null
  return (
    <div className="flex flex-col gap-y-1 border-t border-ui-border-base px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="small" weight="plus">Sizing kit ({kit.length})</Text>
        {due ? <Badge color="blue">Back by {due.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</Badge> : null}
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        {kit.map((i) => i.variant_title || i.title).join(", ")}. When it comes back in good order, refund these lines
        (not postage) on the order page.
      </Text>
    </div>
  )
}

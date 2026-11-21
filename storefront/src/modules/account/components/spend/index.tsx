import type { SpendResponse } from "@lib/data/spend"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import { money, shortDate } from "../quotes/format"
import { chartBars } from "./chart"

const pill = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
    active ? "border-brand bg-brand text-white" : "border-ui-border-base bg-white text-ui-fg-base! hover:bg-ui-bg-subtle"
  }`
const downloadButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ui-border-base bg-white px-4 py-2.5 text-sm font-semibold text-ui-fg-base! hover:bg-ui-bg-subtle"

const STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-700",
  part_paid: "text-amber-700",
  outstanding: "text-rose-700",
  refunded: "text-ui-fg-subtle",
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-ui-bg-subtle p-4">
    <p className="text-xs uppercase tracking-wide text-ui-fg-subtle">{label}</p>
    <p className="mt-1 text-xl font-semibold text-ui-fg-base">{value}</p>
  </div>
)

const SpendReport = ({ data }: { data: SpendResponse }) => {
  const { report, scope, organisations } = data
  const orgId = scope.type === "organisation" ? scope.id : null
  const { max, bars } = chartBars(report.months)
  const query = orgId ? `&organisation_id=${encodeURIComponent(orgId)}` : ""
  const hasCostCentres = report.cost_centres.length > 0

  return (
    <div className="flex flex-col gap-8" data-testid="spend-report">
      {organisations.length > 0 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Whose spend">
          <LocalizedClientLink href="/account/spend" className={pill(!orgId)}>
            My orders
          </LocalizedClientLink>
          {organisations.map((o) => (
            <LocalizedClientLink key={o.id} href={`/account/spend?organisation=${encodeURIComponent(o.id)}`} className={pill(orgId === o.id)}>
              {o.name}
            </LocalizedClientLink>
          ))}
        </nav>
      ) : null}

      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
        <Stat label="Spend, last 24 months" value={money(report.totals.spend)} />
        <Stat label="Orders" value={String(report.totals.orders)} />
        <Stat label="Outstanding" value={money(report.totals.outstanding)} />
      </div>

      <section aria-label="Spend by month">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">Spend by month</h2>
        {report.totals.orders === 0 ? (
          <p className="rounded-xl border border-dashed border-ui-border-base p-6 text-center text-sm text-ui-fg-subtle">
            No orders in the last 24 months.
          </p>
        ) : (
          <div className="rounded-xl border border-ui-border-base bg-white p-4">
            <p className="mb-1 text-xs text-ui-fg-subtle">{money(max)}</p>
            {/* Plain CSS bars: each column is one month, height = share of the top value. */}
            <div className="flex h-40 items-end gap-[3px] border-b border-t border-gray-200" role="img" aria-label={`Bar chart of spend by month, up to ${money(max)}`}>
              {bars.map((b) => (
                <div key={b.month} className="flex h-full flex-1 items-end" title={`${b.label}: ${money(b.total)}`}>
                  <div className="w-full rounded-t-sm bg-brand" style={{ height: `${b.pct}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-[3px]" aria-hidden>
              {bars.map((b) => (
                <span key={b.month} className="flex-1 overflow-visible whitespace-nowrap text-[10px] text-ui-fg-subtle">
                  {b.tick}
                </span>
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm tablet:grid-cols-3">
              {report.months
                .filter((m) => m.orders > 0)
                .reverse()
                .map((m) => (
                  <li key={m.month} className="flex justify-between gap-2">
                    <span className="text-ui-fg-subtle">{m.label}</span>
                    <span className="font-medium text-ui-fg-base">{money(m.total)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      {hasCostCentres ? (
        <section aria-label="Spend by cost centre">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">Spend by cost centre</h2>
          <ul className="divide-y divide-gray-100 rounded-xl border border-ui-border-base bg-white">
            {report.cost_centres.map((c) => (
              <li key={c.cost_centre} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-ui-fg-base">{c.cost_centre}</span>
                <span className="text-ui-fg-subtle">
                  {c.orders} order{c.orders === 1 ? "" : "s"} · <span className="font-semibold text-ui-fg-base">{money(c.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Statement of invoices">
        <div className="mb-3 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">Statement of invoices</h2>
          {report.statement.length > 0 ? (
            <div className="flex gap-2">
              <a href={`/api/account/spend?format=pdf${query}`} download className={downloadButton} data-testid="statement-pdf">
                Download PDF
              </a>
              <a href={`/api/account/spend?format=csv${query}`} download className={downloadButton} data-testid="statement-csv">
                Download CSV
              </a>
            </div>
          ) : null}
        </div>
        {report.statement.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-ui-border-base bg-white">
            <table className="w-full min-w-xl text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ui-fg-subtle">
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">PO</th>
                  {hasCostCentres ? <th className="px-4 py-3 font-semibold">Cost centre</th> : null}
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.statement.map((r) => (
                  <tr key={r.order_id}>
                    <td className="px-4 py-3 text-ui-fg-subtle">{shortDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-ui-fg-base">
                      {orgId ? (
                        `#${r.display_id ?? ""}`
                      ) : (
                        <LocalizedClientLink href={`/account/orders/details/${r.order_id}`} className="underline">
                          #{r.display_id ?? ""}
                        </LocalizedClientLink>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ui-fg-subtle">{r.po_number ?? ""}</td>
                    {hasCostCentres ? <td className="px-4 py-3 text-ui-fg-subtle">{r.cost_centre ?? ""}</td> : null}
                    <td className="px-4 py-3 text-right font-medium text-ui-fg-base">{money(r.total)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${STATUS_TONE[r.status] ?? ""}`}>
                      {r.status === "part_paid" || r.status === "outstanding" ? `${money(r.outstanding)} owing` : r.status_label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ui-fg-subtle">All amounts include GST. Tax invoices are on each order.</p>
      </section>
    </div>
  )
}

export default SpendReport

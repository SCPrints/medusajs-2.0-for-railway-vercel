import type { PriceList, PriceRange } from "@lib/data/prices"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import { money, shortDate } from "../quotes/format"

const downloadButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ui-border-base bg-white px-4 py-2.5 text-sm font-semibold text-ui-fg-base! hover:bg-ui-bg-subtle"

const range = (r: PriceRange) => (r == null ? "—" : r.max > r.min ? `${money(r.min)} – ${money(r.max)}` : money(r.min))

const th = "px-3 py-3 text-right font-semibold whitespace-nowrap"
const td = "px-3 py-3 text-right whitespace-nowrap text-ui-fg-base"

const PriceListView = ({ list }: { list: PriceList }) => (
  <div className="flex flex-col gap-8" data-testid="price-list">
    <div className="flex flex-col gap-3 rounded-xl bg-ui-bg-subtle p-4 tablet:flex-row tablet:items-center tablet:justify-between">
      <p className="text-sm text-ui-fg-base">
        Prices as at {shortDate(list.generated_at)}, including GST.
        {list.tier ? <> Your pricing level: <strong>{list.tier}</strong>.</> : null} Prices can change.
      </p>
      <div className="flex gap-2">
        <a href="/api/account/prices?format=pdf" download className={downloadButton} data-testid="prices-pdf">
          Download PDF
        </a>
        <a href="/api/account/prices?format=csv" download className={downloadButton} data-testid="prices-csv">
          Download CSV
        </a>
      </div>
    </div>

    <section aria-label="Garment prices">
      <h2 className="mb-1 text-lg font-semibold text-ui-fg-base">Your garments</h2>
      <p className="mb-3 text-sm text-ui-fg-subtle">
        Blank garment, each, by how many you order. A range means bigger sizes cost more.
      </p>
      {list.garments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ui-border-base p-6 text-center text-sm text-ui-fg-subtle">
          Garments you order will be listed here with your prices.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ui-border-base bg-white">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ui-fg-subtle">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-3 font-semibold">Garment</th>
                {list.breaks.map((b) => (
                  <th key={b.label} className={th}>Qty {b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.garments.map((g) => (
                <tr key={g.product_id}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {g.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.thumbnail} alt="" className="h-10 w-10 flex-none rounded-sm border border-gray-200 bg-white object-contain" />
                      ) : null}
                      {g.handle ? (
                        <LocalizedClientLink href={`/products/${g.handle}`} className="font-medium text-ui-fg-base underline">
                          {g.title}
                        </LocalizedClientLink>
                      ) : (
                        <span className="font-medium text-ui-fg-base">{g.title}</span>
                      )}
                    </div>
                  </td>
                  {g.prices.map((p, i) => (
                    <td key={i} className={td}>{range(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {list.decoration.map((t) => (
      <section key={t.title} aria-label={t.title}>
        <h2 className="mb-1 text-lg font-semibold text-ui-fg-base">{t.title}</h2>
        <p className="mb-3 text-sm text-ui-fg-subtle">{t.note}</p>
        <div className="overflow-x-auto rounded-xl border border-ui-border-base bg-white">
          <table className="w-full min-w-xl text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ui-fg-subtle">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-3 font-semibold">Size</th>
                {t.columns.map((c) => (
                  <th key={c} className={th}>Qty {c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {t.rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-3 text-ui-fg-base">{r.label}</td>
                  {r.prices.map((p, i) => (
                    <td key={i} className={td}>{money(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ))}

    <p className="text-xs text-ui-fg-subtle">
      Screen printing and anything unusual is quoted per job. Your cart always shows the current price.
    </p>
  </div>
)

export default PriceListView

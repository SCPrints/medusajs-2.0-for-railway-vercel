import type { QuoteJobBreakdown } from "@lib/data/quote-accept"

/**
 * "How your quote was built" — the Job pricer's groups (garment × size run ×
 * decoration positions), the per-design setups and the totals, so the customer
 * reads the job the way staff priced it rather than a list of colour/size SKUs.
 * Only rendered when the quote was priced in the Job pricer and its lines still
 * match (the backend returns null otherwise).
 */
const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(n)

const JobBreakdown = ({ breakdown, currency }: { breakdown: QuoteJobBreakdown; currency: string }) => {
  const money = (n: number) => fmt(n, currency)
  const designs = breakdown.designs.filter((d) => d.image_url)
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-subtle">
        How your quote was built
      </p>
      <div className="rounded-lg border border-[rgba(26,26,46,0.08)] divide-y divide-[rgba(26,26,46,0.06)]">
        {breakdown.groups.map((g, i) => (
          <div key={i} className="px-3 py-3">
            <div className="flex items-start gap-3">
              {g.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.thumbnail} alt="" className="h-12 w-12 flex-none rounded-md border border-[rgba(26,26,46,0.08)] bg-white object-contain" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--brand-primary)]">
                    {g.quantity} × {g.title}
                  </p>
                  <span className="whitespace-nowrap text-sm text-ui-fg-base">{money(g.total)}</span>
                </div>
                <p className="text-xs text-ui-fg-subtle">
                  {g.unit_min !== g.unit_max ? `${money(g.unit_min)} – ${money(g.unit_max)}` : money(g.unit_min)} each
                  {g.positions.length ? ` · ${g.positions.join(" · ")}` : " · blank garment"}
                </p>
                {g.rows.length > 1 ? (
                  <p className="mt-1 text-xs text-ui-fg-muted">
                    {g.rows.map((r) => `${r.label} × ${r.quantity}`).join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {breakdown.extras.length ? (
          <ul className="px-3 py-2 text-xs">
            {breakdown.extras.map((x, i) => (
              <li key={i} className={`flex justify-between gap-3 py-0.5 ${x.waived ? "text-ui-fg-muted line-through" : "text-ui-fg-subtle"}`}>
                <span>{x.label}</span>
                <span className="whitespace-nowrap">
                  {x.quantity > 1 ? `${x.quantity} × ${money(x.unit)} = ` : ""}
                  {money(x.total)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="px-3 py-2 text-sm">
          {breakdown.totals.discount > 0 ? (
            <>
              <div className="flex justify-between text-ui-fg-subtle"><span>Subtotal</span><span>{money(breakdown.totals.subtotal)}</span></div>
              <div className="flex justify-between text-ui-fg-subtle"><span>Discount</span><span>−{money(breakdown.totals.discount)}</span></div>
            </>
          ) : null}
          <div className="flex justify-between font-semibold text-[var(--brand-primary)]">
            <span>Total (inc GST)</span>
            <span>{money(breakdown.totals.total)}</span>
          </div>
        </div>
      </div>
      {designs.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {designs.map((d) => (
            <figure key={d.label} className="m-0 flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.image_url!} alt={`Design ${d.label}`} className="h-10 w-10 rounded border border-[rgba(26,26,46,0.08)] bg-white object-contain" />
              <figcaption className="text-xs text-ui-fg-muted">Design {d.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default JobBreakdown

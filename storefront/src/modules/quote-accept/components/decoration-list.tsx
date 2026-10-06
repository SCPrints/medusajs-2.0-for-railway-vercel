import type { QuoteDecoration } from "@lib/data/quote-accept"

/**
 * "What we're decorating" — technique + size per position. Shared by the
 * quote-accept and design-approval pages so the customer signs off on the
 * method (print vs embroidery) and size, not just a picture.
 */
const DecorationList = ({
  decorations,
}: {
  decorations?: QuoteDecoration[]
}) => {
  if (!decorations?.length) return null
  const multiGarment =
    new Set(decorations.map((d) => d.garment ?? "")).size > 1
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-subtle">
        Decoration details
      </p>
      <ul className="divide-y divide-[rgba(26,26,46,0.06)] rounded-lg border border-[rgba(26,26,46,0.08)]">
        {decorations.map((d, i) => (
          <li key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--brand-primary)]">
                {d.side_label}
                {multiGarment && d.garment ? (
                  <span className="font-normal text-ui-fg-subtle"> · {d.garment}</span>
                ) : null}
              </p>
              {d.detail ? (
                <p className="text-xs text-ui-fg-subtle">{d.detail}</p>
              ) : null}
            </div>
            <span className="whitespace-nowrap text-sm text-ui-fg-base">
              {d.method}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-ui-fg-muted">
        Sizes are approximate and confirmed against your final artwork.
      </p>
    </div>
  )
}

export default DecorationList

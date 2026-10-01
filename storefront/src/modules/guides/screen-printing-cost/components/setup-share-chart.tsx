// Schematic only: these widths illustrate the idea (a fixed setup shared by
// more garments) and are deliberately NOT derived from the rate card.
const ROWS = [
  { label: "Small run", setup: 58, print: 36 },
  { label: "Medium run", setup: 24, print: 36 },
  { label: "Large run", setup: 7, print: 36 },
]

/** Render inside <Reveal> — the bars grow from the left as the block reveals. */
export default function SetupShareChart() {
  return (
    <figure className="m-0 rounded-2xl border border-ui-border-base bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
        Cost of each garment
      </p>
      <div className="mt-4 space-y-4">
        {ROWS.map((row, i) => (
          <div key={row.label}>
            <p className="text-sm font-semibold text-ui-fg-base">{row.label}</p>
            <div className="mt-1.5 h-7 w-full overflow-hidden rounded-md bg-ui-bg-subtle">
              <div
                className="flex h-full origin-left transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0"
                style={{ width: `${row.setup + row.print}%`, transitionDelay: `${0.15 + i * 0.12}s` }}
              >
                <span className="h-full bg-[var(--brand-secondary)]" style={{ flexGrow: row.setup }} />
                <span className="h-full bg-[var(--brand-primary)]" style={{ flexGrow: row.print }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ui-fg-subtle">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[var(--brand-secondary)]" /> Its share of the setup
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[var(--brand-primary)]" /> Printing it
        </span>
      </div>
      <figcaption className="mt-3 text-xs text-ui-fg-muted">
        Illustration only, not to scale. The setup is the same size every time; a bigger run just
        shares it between more garments.
      </figcaption>
    </figure>
  )
}

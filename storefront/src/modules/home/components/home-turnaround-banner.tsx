import type { ProductionEta } from "@lib/data/production-eta"

// Turnaround line (Phase 1 P4). Fixed promise — custom orders currently ship
// within 7 business days (most go out same/next day), so we state that directly
// rather than surfacing the queue-depth ETA range. The `eta` prop is kept for
// compatibility with the home page but is intentionally unused.

export default function HomeTurnaroundBanner({
  eta: _eta,
}: {
  eta: ProductionEta | null
}) {
  return (
    <section className="border-b border-ui-border-base bg-[var(--brand-secondary)]/[0.06]">
      <div className="content-container flex items-center justify-center gap-2.5 px-4 py-2.5 text-center">
        <span
          aria-hidden
          className="inline-block size-2 shrink-0 rounded-full bg-[var(--brand-secondary)] motion-safe:animate-pulse"
        />
        <p className="text-xs font-medium text-ui-fg-base phone:text-sm">
          Custom orders are currently going out{" "}
          <span className="font-semibold text-[var(--brand-secondary)]">
            within 7 business days
          </span>{" "}
          from our NSW studio.
        </p>
      </div>
    </section>
  )
}

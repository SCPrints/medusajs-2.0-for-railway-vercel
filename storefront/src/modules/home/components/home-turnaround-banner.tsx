import type { ProductionEta } from "@lib/data/production-eta"

// Live production-turnaround line (Phase 1 P4). The range comes from the same
// `getProductionEta()` service already shown on PDPs (computed from current
// queue depth), so this introduces no new promise — it mirrors what customers
// already see on product pages. Renders nothing when the service is
// unavailable, so the home page never shows a broken/empty bar.

export default function HomeTurnaroundBanner({
  eta,
}: {
  eta: ProductionEta | null
}) {
  if (!eta || !eta.low_days || !eta.high_days) {
    return null
  }

  const range =
    eta.low_days === eta.high_days
      ? `${eta.low_days}`
      : `${eta.low_days}–${eta.high_days}`

  return (
    <section className="border-b border-ui-border-base bg-[var(--brand-secondary)]/[0.06]">
      <div className="content-container flex items-center justify-center gap-2.5 px-4 py-2.5 text-center">
        <span
          aria-hidden
          className="inline-block size-2 shrink-0 rounded-full bg-[var(--brand-secondary)] motion-safe:animate-pulse"
        />
        <p className="text-xs font-medium text-ui-fg-base phone:text-sm">
          Custom orders are currently going out in{" "}
          <span className="font-semibold text-[var(--brand-secondary)]">
            ~{range} business days
          </span>{" "}
          from our NSW studio.
        </p>
      </div>
    </section>
  )
}

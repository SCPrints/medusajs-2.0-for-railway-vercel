import type { ProductionEta } from "@lib/data/production-eta"
import NoMinimumBadge from "@modules/common/components/no-minimum-badge"

// Turnaround line (Phase 1 P4). Fixed promise matching TURNAROUNDS in
// @modules/decoration/lib/rush (DTF 3–5, embroidery + screen 7–10), stated
// directly rather than surfacing the queue-depth ETA range. The `eta` prop is
// kept for compatibility with the home page but is intentionally unused.

export default function HomeTurnaroundBanner({
  eta: _eta,
}: {
  eta: ProductionEta | null
}) {
  return (
    <section className="border-b border-ui-border-base bg-[var(--brand-secondary)]/[0.06]">
      <div className="content-container flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-2.5 text-center">
        <NoMinimumBadge />
        <p className="flex items-center gap-2.5 text-xs font-medium text-ui-fg-base phone:text-sm">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full bg-[var(--brand-secondary)] motion-safe:animate-pulse"
          />
          <span>
            DTF prints ship in{" "}
            <span className="font-semibold text-[var(--brand-secondary)]">
              3–5 business days
            </span>
            , embroidery and screen printing in{" "}
            <span className="font-semibold text-[var(--brand-secondary)]">
              7–10
            </span>
            , from our NSW studio.
          </span>
        </p>
      </div>
    </section>
  )
}

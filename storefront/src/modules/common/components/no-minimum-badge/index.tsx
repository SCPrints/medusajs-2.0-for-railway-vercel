// "From 1 garment, no minimum" — a key differentiator (most competitors
// impose 10–25 unit minimums). Shown in the PDP hero and the homepage strip.
// Screen printing's 50-unit per-method minimum is surfaced in the estimator;
// every garment on the site can be ordered as a single DTF/embroidered unit.
export default function NoMinimumBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-secondary)]/10 px-3 py-1 text-xs font-semibold !text-[var(--brand-secondary)] phone:text-sm ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      From 1 garment · no minimum order
    </span>
  )
}

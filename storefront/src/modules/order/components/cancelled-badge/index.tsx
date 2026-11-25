/** Rose "Cancelled" pill for order lists (account and organisation pages). */
const CancelledBadge = ({ className = "" }: { className?: string }) => (
  <span
    className={`inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold normal-case tracking-normal text-rose-700 ${className}`}
    data-testid="order-cancelled-badge"
  >
    Cancelled
  </span>
)

export default CancelledBadge

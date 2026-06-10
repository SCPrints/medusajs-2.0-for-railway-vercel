export default function Loading() {
  // Generic route fallback. Two deliberate properties:
  //  1. LOW detail — the old card-grid skeleton matched almost no real page,
  //     so the skeleton→content swap dragged visible elements around (a
  //     measurable CLS hit on every hard load of every (main) route).
  //  2. At least viewport height — keeps the footer below the fold while the
  //     page streams, so the swap never moves an element the user can see.
  // Routes with a real streaming hole (category/store grids, the PDP) ship
  // their own shaped loading.tsx / Suspense fallbacks.
  return (
    <div
      className="content-container min-h-screen py-12 small:py-16"
      aria-busy="true"
    >
      <div className="h-6 w-40 animate-pulse rounded bg-ui-bg-subtle" />
      <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-ui-bg-subtle" />
      <div className="mt-10 h-[60vh] animate-pulse rounded-2xl border border-ui-border-base bg-ui-bg-subtle" />
    </div>
  )
}

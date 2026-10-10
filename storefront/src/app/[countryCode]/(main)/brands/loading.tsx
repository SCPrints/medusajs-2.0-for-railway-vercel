import repeat from "@lib/util/repeat"

/** Instant shell for the brands index so a click shows feedback before the
 * brand list resolves. Mirrors the 2/3/4-column card grid of the real page. */
export default function Loading() {
  return (
    <section className="content-container py-16 small:py-20">
      <div className="mx-auto mb-10 max-w-6xl">
        <div className="h-10 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded bg-gray-200" />
      </div>
      <ul className="mx-auto grid max-w-6xl list-none grid-cols-2 gap-4 p-0 small:grid-cols-3 medium:grid-cols-4">
        {repeat(12).map((idx) => (
          <li
            key={idx}
            className="flex h-40 flex-col gap-4 rounded-xl border border-ui-border-base bg-white p-5"
          >
            <div className="h-12 w-12 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
          </li>
        ))}
      </ul>
    </section>
  )
}

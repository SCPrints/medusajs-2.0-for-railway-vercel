import repeat from "@lib/util/repeat"

export default function Loading() {
  return (
    <div className="content-container py-12 small:py-16">
      <div className="rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:p-10">
        <div className="h-6 w-28 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-12 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-gray-200" />
      </div>

      <div className="mt-10 grid gap-5 small:grid-cols-2 large:grid-cols-3">
        {repeat(6).map((idx) => (
          <div
            key={idx}
            className="h-44 animate-pulse rounded-xl border border-ui-border-base bg-white"
          />
        ))}
      </div>
    </div>
  )
}

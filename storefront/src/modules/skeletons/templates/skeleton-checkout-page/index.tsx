import repeat from "@lib/util/repeat"

const SkeletonCheckoutPage = () => {
  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <div className="space-y-8">
        {repeat(4).map((idx) => (
          <section key={idx} className="rounded-xl border border-ui-border-base bg-white p-6">
            <div className="h-6 w-36 animate-pulse rounded bg-gray-200" />
            <div className="mt-4 h-5 w-64 max-w-full animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-5 w-52 max-w-full animate-pulse rounded bg-gray-200" />
          </section>
        ))}
      </div>
      <aside className="rounded-xl border border-ui-border-base bg-white p-6 h-fit">
        <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-5 w-full animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-5 w-5/6 animate-pulse rounded bg-gray-200" />
        <div className="mt-8 h-10 w-full animate-pulse rounded bg-gray-200" />
      </aside>
    </div>
  )
}

export default SkeletonCheckoutPage

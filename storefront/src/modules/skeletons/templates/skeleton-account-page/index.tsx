import repeat from "@lib/util/repeat"

const SkeletonAccountPage = () => {
  return (
    <div className="w-full" data-testid="account-page-skeleton">
      <div className="mb-8 flex flex-col gap-y-4">
        <div className="h-10 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-96 max-w-full animate-pulse rounded bg-gray-200" />
      </div>

      <div className="flex flex-col gap-y-6">
        {repeat(4).map((idx) => (
          <div key={idx} className="rounded-lg border border-ui-border-base bg-white p-5">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default SkeletonAccountPage

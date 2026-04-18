const SkeletonProductPage = () => {
  return (
    <div className="content-container flex flex-col small:flex-row small:items-start py-6 relative gap-8">
      <div className="flex flex-col small:max-w-[300px] w-full py-8 gap-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
        <div className="h-24 w-full animate-pulse rounded bg-gray-200" />
      </div>

      <div className="block w-full relative">
        <div className="aspect-square w-full animate-pulse rounded-2xl bg-gray-200" />
      </div>

      <div className="flex flex-col small:max-w-[300px] w-full py-8 gap-y-6">
        <div className="h-12 w-full animate-pulse rounded bg-gray-200" />
        <div className="h-12 w-full animate-pulse rounded bg-gray-200" />
        <div className="h-12 w-full animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  )
}

export default SkeletonProductPage

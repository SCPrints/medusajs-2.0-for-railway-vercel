import repeat from "@lib/util/repeat"
import SkeletonProductGrid from "../skeleton-product-grid"

const SkeletonCatalogPage = () => {
  return (
    <div className="flex flex-col small:flex-row small:items-start py-6 content-container">
      <div className="flex small:flex-col gap-12 py-4 mb-8 small:px-0 pl-6 small:min-w-[250px] small:ml-[1.675rem]">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          {repeat(5).map((idx) => (
            <div key={idx} className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      </div>
      <div className="w-full">
        <div className="mb-8">
          <div className="h-10 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-5 w-72 animate-pulse rounded bg-gray-200" />
        </div>
        <SkeletonProductGrid />
      </div>
    </div>
  )
}

export default SkeletonCatalogPage

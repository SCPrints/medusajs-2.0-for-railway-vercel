import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

const SkeletonProductGrid = () => {
  return (
    // 12 tiles = PRODUCT_LIMIT in paginated-products.tsx, and the grid gap
    // classes mirror the real products-list <ul> — both must match the real
    // grid or the skeleton→content swap shifts the footer.
    <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-10 medium:gap-x-8 flex-1" data-testid="products-list-loader">
      {repeat(12).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid

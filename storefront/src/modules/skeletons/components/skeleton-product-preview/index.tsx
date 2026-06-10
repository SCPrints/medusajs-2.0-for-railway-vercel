import { Container } from "@medusajs/ui"

type SkeletonProductPreviewProps = {
  /** `listing` matches store grid / ProductListingCard (square). `portrait` matches default ProductPreview. */
  layout?: "listing" | "portrait"
}

const SkeletonProductPreview = ({
  layout = "listing",
}: SkeletonProductPreviewProps) => {
  if (layout === "portrait") {
    return (
      <div className="animate-pulse">
        <Container className="aspect-[9/16] w-full bg-gray-100 bg-ui-bg-subtle" />
        <div className="mt-2 flex justify-between text-base-regular">
          <div className="h-6 w-2/5 bg-gray-100" />
          <div className="h-6 w-1/5 bg-gray-100" />
        </div>
      </div>
    )
  }

  return (
    // Mirrors ProductListingCard's vertical rhythm: image, title, price line,
    // then the "Available colors" label + swatch-dot row. The swatch section
    // was missing before, leaving every skeleton tile ~60px shorter than the
    // real card — a grid-wide shift when the products streamed in.
    <div className="animate-pulse rounded-xl border border-ui-border-base bg-white p-4">
      <Container className="aspect-[1/1] w-full bg-ui-bg-subtle" />
      <div className="mt-4 h-5 w-[80%] max-w-[12rem] rounded bg-ui-bg-subtle" />
      <div className="mt-2 h-4 w-24 rounded bg-ui-bg-subtle" />
      <div className="mt-4 h-3 w-28 rounded bg-ui-bg-subtle" />
      <div className="mt-2 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-5 w-5 rounded-full bg-ui-bg-subtle" />
        ))}
      </div>
    </div>
  )
}

export default SkeletonProductPreview

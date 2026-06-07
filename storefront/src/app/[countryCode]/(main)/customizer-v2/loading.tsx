export default function CustomizerV2Loading() {
  return (
    <div className="content-container py-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Text + CTA column (left on desktop, below the photo on mobile) */}
        <div className="order-2 flex flex-col gap-5 lg:order-none lg:col-span-5">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-3/4 animate-pulse rounded bg-ui-bg-subtle" />
            <div className="h-14 w-full animate-pulse rounded-xl bg-ui-bg-subtle" />
            <div className="mx-auto h-3 w-2/3 animate-pulse rounded bg-ui-bg-subtle" />
          </div>
          <div className="space-y-3 border-t border-ui-border-base pt-5">
            <div className="h-4 w-28 animate-pulse rounded bg-ui-bg-subtle" />
            <div className="flex gap-2">
              <div className="h-10 w-10 animate-pulse rounded-full bg-ui-bg-subtle" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-ui-bg-subtle" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-ui-bg-subtle" />
            </div>
          </div>
        </div>
        {/* Gallery column */}
        <div className="order-1 lg:order-none lg:col-span-7">
          <div className="relative aspect-[4/5] w-full max-h-[62vh] overflow-hidden rounded-2xl bg-gray-100">
            <div className="h-full w-full animate-pulse bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200" />
          </div>
        </div>
      </div>
    </div>
  )
}

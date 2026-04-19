export default function CustomizerLoading() {
  return (
    <div className="content-container py-12 small:py-16">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="mx-auto h-10 w-72 animate-pulse rounded bg-ui-bg-subtle" />
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-gray-100 shadow-inner">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200" />
        </div>
      </div>
    </div>
  )
}

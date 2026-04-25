import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Heading, Text } from "@medusajs/ui"

type Props = {
  countryCode: string
}

export function DtfBuilderInvalidRegion({ countryCode }: Props) {
  return (
    <div className="content-container py-16 max-w-xl">
      <Heading level="h1" className="text-2xl text-ui-fg-base">
        Region not available
      </Heading>
      <Text className="mt-4 text-ui-fg-subtle text-small-regular">
        There is no Medusa store region that includes the country code{" "}
        <span className="font-mono text-ui-fg-base">{countryCode}</span>. In Medusa Admin, open{" "}
        <strong>Settings → Regions</strong> and add this country to a region, or use a link that matches an existing
        region (for example the default in <span className="font-mono">NEXT_PUBLIC_DEFAULT_REGION</span>).
      </Text>
      <LocalizedClientLink
        href="/"
        className="mt-6 inline-block text-small font-medium text-ui-fg-interactive hover:underline"
      >
        ← Back to home
      </LocalizedClientLink>
    </div>
  )
}

export function DtfBuilderMissingProduct({ countryCode }: Props) {
  return (
    <div className="content-container py-16 max-w-xl">
      <Heading level="h1" className="text-2xl text-ui-fg-base">
        DTF builder product not found
      </Heading>
      <Text className="mt-4 text-ui-fg-subtle text-small-regular">
        The storefront expects a published product with handle{" "}
        <span className="font-mono text-ui-fg-base">dtf-auto-builder</span> (and at least one variant). It is missing
        from the API for this environment. Add the product in Medusa Admin, or run your backend seed that includes the
        DTF Auto Builder product, then reload.
      </Text>
      <Text className="mt-3 text-xsmall text-ui-fg-muted">
        Locale: <span className="font-mono">{countryCode}</span> — ensure the Medusa server is running and{" "}
        <span className="font-mono">NEXT_PUBLIC_MEDUSA_BACKEND_URL</span> points to it.
      </Text>
      <div className="mt-6 flex flex-wrap gap-4">
        <LocalizedClientLink
          href="/store"
          className="text-small font-medium text-ui-fg-interactive hover:underline"
        >
          Browse store
        </LocalizedClientLink>
        <LocalizedClientLink href="/" className="text-small font-medium text-ui-fg-interactive hover:underline">
          Home
        </LocalizedClientLink>
      </div>
    </div>
  )
}

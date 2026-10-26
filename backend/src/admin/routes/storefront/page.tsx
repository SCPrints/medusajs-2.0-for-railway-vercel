import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { AppLink } from "../../lib/nav"

/** Group page: what the public site shows. Children nest under it in the sidebar. */
const StorefrontHub = () => (
  <Container className="flex flex-col gap-y-3">
    <Heading level="h1">Storefront</Heading>
    <Text size="small" className="text-ui-fg-subtle">What scprints.com.au shows beyond the catalog.</Text>
    <ul className="list-disc pl-5 text-sm">
      <li><AppLink className="text-ui-fg-interactive hover:underline" href="/app/storefront/lookbook">Lookbook</AppLink> — the gallery of past jobs at /lookbook.</li>
      <li><AppLink className="text-ui-fg-interactive hover:underline" href="/app/storefront/home-sections">Home sections</AppLink> — the curated product rails on the home page.</li>
    </ul>
  </Container>
)

export const config = defineRouteConfig({
  label: "Storefront",
  icon: tinted(Sparkles, NAV_COLOR.storefront),
  rank: 40,
})

export default StorefrontHub

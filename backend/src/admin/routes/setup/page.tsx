import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { AppLink } from "../../lib/nav"

/** Group page: how the system behaves. Medusa's own store Settings stay at the bottom of the sidebar. */
const SetupHub = () => (
  <Container className="flex flex-col gap-y-3">
    <Heading level="h1">Setup</Heading>
    <Text size="small" className="text-ui-fg-subtle">Rules and reference for how the admin runs. Store settings (regions, shipping, users) are under Medusa&apos;s Settings below.</Text>
    <ul className="list-disc pl-5 text-sm">
      <li><AppLink className="text-ui-fg-interactive hover:underline" href="/app/setup/automation-rules">Automation rules</AppLink> — when X happens, do Y.</li>
      <li><AppLink className="text-ui-fg-interactive hover:underline" href="/app/setup/help">Help &amp; guide</AppLink> — the staff guide.</li>
      <li><AppLink className="text-ui-fg-interactive hover:underline" href="/app/customers">Owner rotation and email suppressions</AppLink> sit under Customers.</li>
    </ul>
  </Container>
)

export const config = defineRouteConfig({
  label: "Setup",
  icon: tinted(CogSixTooth, NAV_COLOR.catalog),
  rank: 90,
})

export default SetupHub

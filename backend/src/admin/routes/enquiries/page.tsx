import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRightSolid } from "@medusajs/icons"
import { Tabs } from "@medusajs/ui"
import { useState } from "react"

import { initialHubTab } from "../../lib/hub-tab"
import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import ContactSubmissionsPage from "./tabs/contact-submissions"
import OpenCartsPage from "./tabs/open-carts"

const TABS = ["contact", "carts"] as const
type Tab = (typeof TABS)[number]

/**
 * Enquiries — everything that isn't a quote yet: contact-form submissions
 * and carts people built in the Studio but never checked out. Replaces the
 * separate "Contact submissions" and "Open carts" pages; deep links keep
 * working via ?tab=contact | carts (the old URLs redirect here).
 */
const EnquiriesPage = () => {
  const [tab, setTab] = useState<Tab>(() => initialHubTab(TABS, "contact"))
  const change = (v: string) => {
    setTab(v as Tab)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", v)
    window.history.replaceState(window.history.state, "", url.toString()) // keep the router's entry state
  }
  return (
    <Tabs value={tab} onValueChange={change}>
      <Tabs.List className="mb-3">
        <Tabs.Trigger value="contact">Contact submissions</Tabs.Trigger>
        <Tabs.Trigger value="carts">Open carts</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="contact"><ContactSubmissionsPage /></Tabs.Content>
      <Tabs.Content value="carts"><OpenCartsPage /></Tabs.Content>
    </Tabs>
  )
}

export const config = defineRouteConfig({
  label: "Enquiries",
  icon: tinted(ChatBubbleLeftRightSolid, NAV_COLOR.sales),
  nested: "/orders",
  rank: 15,
})

export default EnquiriesPage

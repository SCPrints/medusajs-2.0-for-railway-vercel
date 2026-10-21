import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import { Tabs } from "@medusajs/ui"
import { useState } from "react"

import { initialHubTab } from "../../lib/hub-tab"
import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import AsColourDropshipPage from "./tabs/as-colour"
import AussiePacificDropshipPage from "./tabs/aussie-pacific"
import BottleShopDropshipPage from "./tabs/bottle-shop"

const TABS = ["as-colour", "aussie-pacific", "bottle-shop"] as const
type Tab = (typeof TABS)[number]

/**
 * Dropship — the three supplier order queues on one page. Was three sidebar
 * entries; the old child URLs redirect here with ?tab=.
 */
const DropshipPage = () => {
  const [tab, setTab] = useState<Tab>(() => initialHubTab(TABS, "as-colour"))
  const change = (v: string) => {
    setTab(v as Tab)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", v)
    window.history.replaceState(null, "", url.toString())
  }
  return (
    <Tabs value={tab} onValueChange={change}>
      <Tabs.List className="mb-3">
        <Tabs.Trigger value="as-colour">AS Colour</Tabs.Trigger>
        <Tabs.Trigger value="aussie-pacific">Aussie Pacific</Tabs.Trigger>
        <Tabs.Trigger value="bottle-shop">Bottle shop</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="as-colour"><AsColourDropshipPage /></Tabs.Content>
      <Tabs.Content value="aussie-pacific"><AussiePacificDropshipPage /></Tabs.Content>
      <Tabs.Content value="bottle-shop"><BottleShopDropshipPage /></Tabs.Content>
    </Tabs>
  )
}

export const config = defineRouteConfig({
  label: "Dropship",
  icon: tinted(ArrowPath, NAV_COLOR.production),
  rank: 50,
})

export default DropshipPage

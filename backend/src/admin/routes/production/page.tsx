import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Clock } from "@medusajs/icons"
import { Tabs } from "@medusajs/ui"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { initialHubTab } from "../../lib/hub-tab"
import PrintQueuePage from "./tabs/print-queue"
import PrintRecipesPage from "./tabs/print-recipes"
import ProductionRejectsPage from "./tabs/production-rejects"
import ProductionCalendarPage from "./tabs/production-calendar"

/**
 * Shop-floor tools. The stage list / kanban that used to be the first tab is
 * the Jobs list's Artwork, Blanks and Production folders now (2026-10-27).
 */
const PRODUCTION_TABS = ["print-queue", "print-recipes", "calendar", "rejects"] as const

const ProductionPage = () => (
  <Tabs defaultValue={initialHubTab(PRODUCTION_TABS, "print-queue")}>
    <div className="px-6 pt-4">
      <Tabs.List>
        <Tabs.Trigger value="print-queue">Print queue</Tabs.Trigger>
        <Tabs.Trigger value="print-recipes">Print recipes</Tabs.Trigger>
        <Tabs.Trigger value="calendar">Production calendar</Tabs.Trigger>
        <Tabs.Trigger value="rejects">Rejects</Tabs.Trigger>
      </Tabs.List>
    </div>
    <Tabs.Content value="print-queue"><PrintQueuePage /></Tabs.Content>
    <Tabs.Content value="print-recipes"><PrintRecipesPage /></Tabs.Content>
    <Tabs.Content value="calendar"><ProductionCalendarPage /></Tabs.Content>
    <Tabs.Content value="rejects"><ProductionRejectsPage /></Tabs.Content>
  </Tabs>
)

export const config = defineRouteConfig({
  nested: "/orders",
  label: "Production",
  icon: tinted(Clock, NAV_COLOR.production),
  rank: 20,
})

export default ProductionPage

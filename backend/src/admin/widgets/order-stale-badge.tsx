import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Text } from "@medusajs/ui"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { businessDaysBetween } from "../../lib/business-days"
import { PRODUCTION_STAGE_LABEL, isProductionStage } from "../../lib/production-stage"
import { withWidgetBoundary } from "../components/widget-error-boundary"

const OrderStaleBadgeWidget = ({
  data: order,
}: {
  data: {
    id: string
    status?: string | null
    metadata?: Record<string, unknown> | null
  }
}) => {
  const meta = (order?.metadata ?? {}) as Record<string, unknown>
  if (meta.is_stale !== true) return null
  // A cancelled order isn't stale, it's done. The cron clears the flag on
  // its next run, but only if it's enabled — don't wait on that to hide it.
  if (String(order?.status ?? "").toLowerCase() === "canceled") return null

  // The scan records which stage is stuck and since when. Older flags only
  // have stale_since + production_stage.
  const since =
    typeof meta.stale_stage_since === "string"
      ? meta.stale_stage_since
      : typeof meta.stale_since === "string"
        ? meta.stale_since
        : null
  const stage = typeof meta.production_stage === "string" ? meta.production_stage : null
  const stuckStage = typeof meta.stale_stage === "string" ? meta.stale_stage : stage
  const stuckLabel = isProductionStage(stuckStage) ? PRODUCTION_STAGE_LABEL[stuckStage] : stuckStage
  const days = since && Number.isFinite(Date.parse(since))
    ? businessDaysBetween(new Date(since), new Date())
    : null
  // Shipped/delivered can't be stale — a leftover flag is just waiting for
  // the cron to clear it.
  if (stage === "shipped" || stage === "delivered") return null

  return (
    <Container className="p-0">
      <div className="px-6 py-3 flex items-center justify-between bg-ui-tag-red-bg border-b border-ui-tag-red-border">
        <div className="flex items-center gap-x-2">
          <Badge color="red">Stuck</Badge>
          <Text size="small" weight="plus" className="text-ui-tag-red-text">
            {stuckLabel ? `At ${stuckLabel} ` : "Hasn't moved "}
            for {days ?? "a few"} business day{days === 1 ? "" : "s"}
          </Text>
          <HelpTooltip
            text={{
              title: "Stuck order",
              body: "One of this order's tracks has sat at its stage past its limit: proof awaiting approval 4 business days, artwork in review 2, blanks ordered 5, in production 3, quality check 2, or an untouched order at Received 3. The badge clears when staff move the order.",
              bullets: [
                "Stamped by the daily 08:00 UTC cron, which also emails the order owner and creates a task (once per stuck stage).",
                "Also posts a digest to SLACK_PRODUCTION_WEBHOOK_URL when set, so #production sees the same list.",
                "Terminal stages (shipped/delivered) are excluded.",
              ],
            }}
          />
        </div>
      </div>
    </Container>
  )
}

// Stable id: the layout editor (Medusa 2.17.2+) keys placement by it.
export const config = defineWidgetConfig({
  zone: "order.details.before",
  id: "scp:order-stale-badge",
})

export default withWidgetBoundary(OrderStaleBadgeWidget, "order-stale-badge")

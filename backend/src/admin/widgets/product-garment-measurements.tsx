import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { STATUS } from "../components/garment-measurements/status"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import { AppLink } from "../lib/nav"
import type { SizeStatus } from "../../lib/garment-measurements"

/** Product page card: each size's measuring state + the way into the measuring page. Internal only. */
const ProductGarmentMeasurementsWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [state, setState] = useState<{ sizes: string[]; status: Record<string, SizeStatus> } | null>(null)
  useEffect(() => {
    if (!data?.id) return
    fetch(`/admin/garment-measurements/${data.id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setState)
      .catch(() => setState(null))
  }, [data?.id])

  return (
    <Container className="flex flex-col gap-y-3 px-6 py-4">
      <div>
        <Heading level="h2">3D measurements</Heading>
        <Text size="small" className="text-ui-fg-muted">Flat measurements per size, for the 3D builder. Not shown to customers.</Text>
      </div>
      {state && (
        <div className="flex flex-wrap gap-1.5">
          {state.sizes.map((s) => (
            <Badge key={s} size="2xsmall" color={STATUS[state.status[s] ?? "todo"].color} title={STATUS[state.status[s] ?? "todo"].label}>
              {s}
            </Badge>
          ))}
        </div>
      )}
      <Button size="small" variant="secondary" className="w-full" asChild>
        <AppLink href={`/app/garment-measurements/${data.id}`}>Measure sizes</AppLink>
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default withWidgetBoundary(ProductGarmentMeasurementsWidget, "product-garment-measurements")

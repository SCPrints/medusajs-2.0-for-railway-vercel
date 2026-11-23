import { Container, Text } from "@medusajs/ui"

import type { NeedsSizesOrder } from "../../../lib/sizes-pending"
import { AppLink } from "../../lib/nav"

/** Jobs whose blanks can't be ordered yet, so they're never hidden from the Dropship queue. */
export const NeedsSizesBanner = ({ orders, title = "Needs sizes", hint }: { orders: NeedsSizesOrder[]; title?: string; hint?: string }) => {
  if (!orders.length) return null
  return (
    <Container className="flex flex-col gap-y-2">
      <Text size="small" weight="plus">{title} ({orders.length})</Text>
      {hint ? <Text size="small" className="text-ui-fg-muted">{hint}</Text> : null}
      {orders.map((o) => (
        <Text size="small" key={o.order_id} className="text-ui-fg-subtle">
          <AppLink href={`/app/jobs/${o.order_id}`} className="text-ui-fg-interactive hover:underline">#{o.display_id}</AppLink>
          {` ${o.customer} · ${o.lines.map((l) => `${l.quantity} × ${l.title}`).join(", ")}`}
        </Text>
      ))}
    </Container>
  )
}

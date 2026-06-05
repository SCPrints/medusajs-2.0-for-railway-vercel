import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"

/**
 * Surfaces the print-ready gang sheet the customer built in the storefront DTF
 * builder. The storefront uploads the flattened 300 DPI PNG to R2 on add-to-cart
 * and stamps the public URL onto the line metadata as `dtfGangsheetArtworkUrl`
 * (plus `dtfGangsheetSheetSize` / `dtfGangsheetImageCount`). This widget gives
 * the production team a one-click download — without it the order arrives with
 * no artwork attached and staff have to chase the customer for the file.
 */

type LineMeta = {
  dtfGangsheetArtworkUrl?: string
  dtfGangsheetSheetSize?: string
  dtfGangsheetImageCount?: number | string
  dtfGangsheetVariantId?: string
}

type OrderItem = {
  id: string
  title?: string | null
  product_title?: string | null
  quantity?: number
  metadata?: LineMeta | null
}

function triggerBlobDownload(url: string, fileName: string): Promise<void> {
  return fetch(url, { mode: "cors", credentials: "omit" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.blob()
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    })
}

function GangsheetCard({
  url,
  sheetSize,
  imageCount,
  title,
  quantity,
  displayId,
}: {
  url: string
  sheetSize?: string
  imageCount?: number | string
  title: string
  quantity?: number
  displayId: string
}) {
  const [state, setState] = useState<"idle" | "downloading">("idle")
  const fileName = `gangsheet-${displayId}-${(sheetSize ?? "sheet").replace(/[^a-z0-9]+/gi, "")}.png`

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault()
    setState("downloading")
    triggerBlobDownload(url, fileName)
      .then(() => setState("idle"))
      .catch(() => {
        window.open(url, "_blank", "noreferrer")
        setState("idle")
      })
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-3 sm:flex-row sm:items-center">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block w-24 h-24 shrink-0 rounded-md border border-ui-border-base bg-[length:16px_16px] bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]"
        title="Open full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Gang sheet preview" className="w-full h-full object-contain" />
      </a>
      <div className="flex-1 min-w-0 space-y-1">
        <Text className="text-small font-medium text-ui-fg-base truncate">{title}</Text>
        <div className="flex flex-wrap items-center gap-2">
          {sheetSize && <Badge size="small">{sheetSize}</Badge>}
          {imageCount != null && (
            <Badge size="small" color="grey">
              {imageCount} {Number(imageCount) === 1 ? "image" : "images"}
            </Badge>
          )}
          {quantity != null && quantity > 1 && (
            <Badge size="small" color="grey">
              ×{quantity} rolls
            </Badge>
          )}
        </div>
        <a
          href={url}
          onClick={handleDownload}
          className="text-small text-blue-600 hover:underline"
        >
          {state === "downloading" ? "Downloading…" : "Download 300 DPI PNG"}
        </a>
      </div>
    </li>
  )
}

const OrderDtfGangsheetWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const items = (data?.items ?? []) as unknown as OrderItem[]
  const displayId = String((data as any)?.display_id ?? data?.id ?? "order")

  const sheets = items.filter((it) => {
    const url = it.metadata?.dtfGangsheetArtworkUrl
    return typeof url === "string" && url.trim().length > 0
  })

  if (sheets.length === 0) {
    return null
  }

  return (
    <Container className="p-6 border-t border-ui-border-base">
      <Heading level="h2" className="flex items-center mb-4">
        DTF gang sheets
        <HelpTooltip
          text={{
            title: "DTF gang sheets",
            body: "Print-ready PNGs the customer arranged in the storefront DTF gang sheet builder. Each file is flattened at 300 DPI on a transparent background — send straight to the DTF printer.",
            bullets: [
              "The preview swatch is the actual uploaded file (checkerboard = transparent film).",
              "Sheet size + image count come from the builder so you can sanity-check against the variant ordered.",
            ],
          }}
        />
      </Heading>
      <ul className="space-y-3">
        {sheets.map((it) => (
          <GangsheetCard
            key={it.id}
            url={it.metadata!.dtfGangsheetArtworkUrl as string}
            sheetSize={it.metadata?.dtfGangsheetSheetSize}
            imageCount={it.metadata?.dtfGangsheetImageCount}
            title={it.product_title ?? it.title ?? "Gang sheet"}
            quantity={it.quantity}
            displayId={displayId}
          />
        ))}
      </ul>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default withWidgetBoundary(OrderDtfGangsheetWidget, "order-dtf-gangsheet")

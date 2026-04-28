import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

function adminCustomizerDownloadPath(orderId: string) {
  return `/admin/orders/${orderId}/customizer-download`
}

function adminCustomizerDownloadUrlForDisplay(orderId: string) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/admin/orders/${orderId}/customizer-download`
  }
  return adminCustomizerDownloadPath(orderId)
}

type ArtifactPayload = {
  side: string
  side_label: string
  print_url: string | null
  print_url_inline_omitted?: boolean
  mockup_url: string | null
  mockup_url_inline_omitted?: boolean
}

type LinePayload = {
  line_item_id: string
  product_title: string | null
  variant_title: string | null
  title: string | null
  quantity: number
  has_customizer: boolean
  print_notes: string | null
  artifacts: ArtifactPayload[]
}

type DownloadPayload = {
  order_id?: string
  lines?: LinePayload[]
}

function lineHeading(line: LinePayload) {
  const product = line.product_title || line.title || "Product"
  const variant =
    line.variant_title && typeof line.variant_title === "string" ? line.variant_title : null
  return variant ? `${product} · ${variant}` : product
}

const OrderCustomizerDownloadsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const [payload, setPayload] = useState<DownloadPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orderId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(adminCustomizerDownloadPath(orderId), {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      const body = (await res.json().catch(() => ({}))) as DownloadPayload & { message?: string }
      if (!res.ok) {
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      setPayload(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customizer URLs")
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const lines = payload?.lines?.filter((line) => line.has_customizer) ?? []

  if (!orderId) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Customizer files</Heading>
      </div>

      <div className="px-6 py-4">
        {error ? (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        ) : loading && !payload ? (
          <Text size="small" className="text-ui-fg-subtle">
            Loading downloadable assets…
          </Text>
        ) : lines.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No Fabric customizer (customizerDesign) metadata on this order line.
          </Text>
        ) : (
          <ul className="flex flex-col gap-y-5 list-none p-0 m-0">
            {lines.map((line) => (
              <li
                key={line.line_item_id}
                className="border-b border-ui-border-base pb-4 last:border-0 last:pb-0"
              >
                <Text size="small" weight="plus" className="text-ui-fg-base">
                  {lineHeading(line)}
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  Qty {line.quantity}
                </Text>

                {line.artifacts.length === 0 ? (
                  <Text size="xsmall" className="text-ui-fg-subtle mt-2">
                    Customizer metadata present but no per-side artifacts (or render did not persist
                    hosted URLs—check object storage).
                  </Text>
                ) : null}

                <ul className="mt-2 flex flex-col gap-y-3 list-none p-0">
                  {line.artifacts.map((art) => (
                    <li
                      key={`${line.line_item_id}-${art.side}`}
                      className="rounded-md bg-ui-bg-subtle px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Text size="xsmall" weight="plus">
                          {art.side_label}
                        </Text>
                        {art.print_url_inline_omitted ? (
                          <Badge size="2xsmall" color="orange">
                            Print file too large (inline)
                          </Badge>
                        ) : null}
                        {art.mockup_url_inline_omitted ? (
                          <Badge size="2xsmall" color="orange">
                            Mockup too large (inline)
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        {art.print_url ? (
                          <a
                            href={art.print_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-small text-blue-600 hover:underline break-all"
                          >
                            Download print file (PNG)
                          </a>
                        ) : !art.print_url_inline_omitted ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            No print URL on record for this side.
                          </Text>
                        ) : null}
                        {art.mockup_url ? (
                          <a
                            href={art.mockup_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-small text-blue-600 hover:underline break-all"
                          >
                            Open garment preview image
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <Text size="xsmall" className="text-ui-fg-muted mt-4">
          API: <code>{adminCustomizerDownloadUrlForDisplay(orderId)}</code>
        </Text>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderCustomizerDownloadsWidget

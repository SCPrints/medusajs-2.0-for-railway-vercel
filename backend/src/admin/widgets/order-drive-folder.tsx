import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { withWidgetBoundary } from "../components/widget-error-boundary"

type StoredFolder = {
  id: string
  url: string
  name: string
  created_at?: string
}

type Status = {
  configured: boolean
  folder: StoredFolder | null
  suggested_name: string
}

const OrderDriveFolderWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const [status, setStatus] = useState<Status | null>(null)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    fetch(`/admin/orders/${orderId}/drive-folder`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: Status | null) => {
        if (cancelled || !json) return
        setStatus(json)
        setName(json.suggested_name ?? "")
      })
      .catch(() => {
        // widget stays hidden on fetch failure
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!status?.configured) {
    return null
  }

  const createFolder = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/admin/orders/${orderId}/drive-folder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.detail || json?.error || "Failed to create folder")
      }
      setStatus((s) => (s ? { ...s, folder: json.folder } : s))
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2" className="flex items-center">
          Job folder
          <HelpTooltip
            text={{
              title: "Google Drive job folder",
              body: "Creates the job folder in the shared Jobs folder on Google Drive, with a 'Files' subfolder for artwork — same structure as the manually created ones.",
              bullets: [
                "The name is prefilled as Company | Customer | Order # — tidy it before creating if needed.",
                "Once created, this shows a link instead — one folder per order.",
                "Drop artwork and job files into the 'Files' subfolder as usual.",
              ],
            }}
          />
        </Heading>

        {status.folder ? (
          <div className="mt-2">
            <a
              href={status.folder.url}
              target="_blank"
              rel="noreferrer"
              className="text-ui-fg-interactive text-sm hover:underline"
            >
              {status.folder.name || "Open job folder"} ↗
            </a>
            <Text size="xsmall" className="text-ui-fg-subtle mt-1">
              Artwork goes in the "Files" subfolder.
            </Text>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company | Customer | Order #"
              disabled={creating}
            />
            <Button
              size="small"
              variant="secondary"
              onClick={createFolder}
              isLoading={creating}
              disabled={!name.trim()}
            >
              Create job folder in Drive
            </Button>
            {error && (
              <Text size="xsmall" className="text-ui-fg-error">
                {error}
              </Text>
            )}
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default withWidgetBoundary(OrderDriveFolderWidget, "order-drive-folder")

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
  pending_files: number
}

const OrderDriveFolderWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const [status, setStatus] = useState<Status | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  const run = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/admin/orders/${orderId}/drive-folder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.detail || json?.error || "Request failed")
      }
      setStatus((s) =>
        s ? { ...s, folder: json.folder, pending_files: json.failed?.length ?? 0 } : s
      )
      const parts: string[] = []
      if (json.uploaded > 0) parts.push(`${json.uploaded} file${json.uploaded === 1 ? "" : "s"} uploaded`)
      if (json.failed?.length) parts.push(`${json.failed.length} failed`)
      setNotice(parts.length ? parts.join(", ") : "Up to date — nothing new to upload")
      if (json.failed?.length) {
        setError(json.failed.map((f: any) => `${f.name}: ${f.error}`).join("; "))
      }
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
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
              body: "Creates the job folder in the shared Jobs folder on Google Drive, with a 'Files' subfolder (customer's uploaded artwork) and a 'Mockups' subfolder (design mockups + revised proofs).",
              bullets: [
                "The name is prefilled as Company | Customer | Order # — tidy it before creating if needed.",
                "Once created, this shows a link plus a Sync button — one folder per order.",
                "Sync pushes any files that arrived after the folder was created (re-uploads, new mockups).",
              ],
            }}
          />
        </Heading>

        {status.folder ? (
          <div className="mt-2 flex flex-col gap-y-2">
            <a
              href={status.folder.url}
              target="_blank"
              rel="noreferrer"
              className="text-ui-fg-interactive text-sm hover:underline"
            >
              {status.folder.name || "Open job folder"} ↗
            </a>
            <Button size="small" variant="secondary" onClick={run} isLoading={busy}>
              Sync files to Drive
              {status.pending_files > 0 ? ` (${status.pending_files} new)` : ""}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company | Customer | Order #"
              disabled={busy}
            />
            <Button
              size="small"
              variant="secondary"
              onClick={run}
              isLoading={busy}
              disabled={!name.trim()}
            >
              Create job folder in Drive
              {status.pending_files > 0 ? ` (+${status.pending_files} files)` : ""}
            </Button>
          </div>
        )}

        {notice && (
          <Text size="xsmall" className="text-ui-fg-subtle mt-2">
            {notice}
          </Text>
        )}
        {error && (
          <Text size="xsmall" className="text-ui-fg-error mt-1">
            {error}
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default withWidgetBoundary(OrderDriveFolderWidget, "order-drive-folder")

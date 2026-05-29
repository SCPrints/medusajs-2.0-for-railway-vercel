import { Button, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

/**
 * "Scan images" control for the Browse & manage data-quality section.
 *
 * Kicks off the product-image liveness scan
 * ([api/admin/products-manager/image-audit]) that populates the
 * "Broken image" flag, and surfaces last-run stats. The scan runs in the
 * background server-side (a full sweep takes minutes), so this just fires
 * it and polls the status endpoint until it finishes — the operator then
 * re-applies the "Broken image" filter to see the flagged products.
 */

type AuditState = {
  in_progress: boolean
  started_at: string | null
  scope: string | null
  last_run: {
    scanned: number
    checked: number
    broken_found: number
    updated: number
    scope: string
    finished_at: string
  } | null
}

const ENDPOINT = "/admin/products-manager/image-audit"

const ImageScanControl = () => {
  const [state, setState] = useState<AuditState | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (res.ok) setState((await res.json()) as AuditState)
    } catch {
      /* status hint is best-effort */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while a scan is running so "Scanning…" flips back on its own.
  useEffect(() => {
    if (!state?.in_progress) return
    const id = setInterval(() => void load(), 4000)
    return () => clearInterval(id)
  }, [state?.in_progress, load])

  const start = async () => {
    setStarting(true)
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (json?.started === false && json?.in_progress) {
        toast.info("A scan is already running.")
      } else {
        toast.success(
          "Image scan started — re-apply the Broken image filter in a few minutes."
        )
      }
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start image scan")
    } finally {
      setStarting(false)
    }
  }

  const inProgress = !!state?.in_progress
  const last = state?.last_run

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        size="small"
        variant="secondary"
        onClick={() => void start()}
        disabled={inProgress || starting}
      >
        {inProgress ? "Scanning…" : starting ? "Starting…" : "Scan images"}
      </Button>
      <Text size="xsmall" className="text-ui-fg-muted">
        {inProgress
          ? "Checking thumbnail URLs across the catalog…"
          : last
            ? `Last scan: ${last.broken_found} broken of ${last.checked} checked${last.scope && last.scope !== "all" ? ` (${last.scope})` : ""}.`
            : "HEAD-checks every thumbnail and flags the dead ones."}
      </Text>
    </div>
  )
}

export default ImageScanControl

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownTray } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useCallback, useMemo, useRef, useState } from "react"
import { HelpTooltip } from "../../components/reports/help-tooltip"

type ImportResponse = {
  ok: boolean
  parsedRows?: number
  groupedProducts?: number
  toCreate?: number
  toUpdate?: number
  created?: number
  updated?: number
  variantsAdded?: number
  errors?: number
  warnings?: string[]
  logs?: string[]
  imageScraperStats?: {
    cacheHits: number
    fetched: number
    fetchErrors: number
  }
  error?: string
}

const adminUrl = (path: string) => {
  const base = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.onload = () => {
      const dataUrl = reader.result as string
      const idx = dataUrl.indexOf(",")
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl)
    }
    reader.readAsDataURL(file)
  })

const GildanImportPage = () => {
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(true)
  // Default ON — re-running with the same xlsx but skipping existing
  // styles is almost never what the operator wants (it locks in any data
  // gaps from the first import). The diff helper is conservative:
  // appends images, preserves staff metadata, only writes when there's
  // a real change. Untick if you specifically want create-only.
  const [updateExisting, setUpdateExisting] = useState(true)
  const [limit, setLimit] = useState<string>("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const onSubmit = useCallback(async () => {
    if (!file) {
      toast.error("Pick an .xlsx file first")
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const fileBase64 = await readFileAsBase64(file)
      const parsedLimit = limit.trim() ? Number.parseInt(limit, 10) : undefined
      const resp = await fetch(adminUrl("/admin/gildan/import"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          filename: file.name,
          dryRun,
          updateExisting,
          limit:
            parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0
              ? parsedLimit
              : undefined,
        }),
      })
      const json = (await resp.json()) as ImportResponse
      setResult(json)
      if (!resp.ok || !json.ok) {
        toast.error(json.error ?? `HTTP ${resp.status}`)
      } else if (dryRun) {
        toast.success(
          `Dry run OK — ${json.toCreate ?? 0} to create, ${json.toUpdate ?? 0} to update`
        )
      } else {
        toast.success(
          `Imported ${json.created ?? 0}, updated ${json.updated ?? 0} (added ${json.variantsAdded ?? 0} variants).`
        )
      }
    } catch (err: any) {
      toast.error(err?.message ?? String(err))
      setResult({ ok: false, error: err?.message ?? String(err) })
    } finally {
      setRunning(false)
    }
  }, [file, dryRun, updateExisting, limit])

  const logsBody = useMemo(() => {
    if (!result?.logs?.length) return null
    // Show only the last 100 log lines to keep the page snappy.
    const tail = result.logs.slice(-100)
    return tail.join("\n")
  }, [result?.logs])

  return (
    <Container className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Heading level="h1" className="flex items-center gap-2">
          Gildan Import
          <HelpTooltip
            text="Upload the latest Gildan Brands Australia data file (xlsx). The importer groups rows by (brand, style), scrapes product images from gildanbrands.com.au, and creates Medusa products. Update Existing also diffs prices + images on previously imported handles."
          />
        </Heading>
        <Badge color="grey">Gildan / American Apparel / Comfort Colors</Badge>
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-ui-border-base bg-ui-bg-base p-4">
        <div>
          <Label className="mb-1 block" htmlFor="gildan-xlsx">
            Spreadsheet
          </Label>
          <input
            id="gildan-xlsx"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
          {file ? (
            <Text size="small" className="mt-1 text-ui-fg-muted">
              {file.name} · {Math.round(file.size / 1024)}KB
            </Text>
          ) : (
            <Text size="small" className="mt-1 text-ui-fg-muted">
              No file selected. Expected format: the Gildan-supplied "Data File"
              .xlsx with the columns documented in CLAUDE.md.
            </Text>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          <div>
            <Label className="mb-1 block" htmlFor="gildan-limit">
              Limit (optional)
            </Label>
            <Input
              id="gildan-limit"
              type="number"
              min={1}
              placeholder="e.g. 5 for a smoke test"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <label className="mt-6 flex items-center gap-2">
            <Checkbox
              checked={dryRun}
              onCheckedChange={(c) => setDryRun(!!c)}
            />
            <span className="text-sm">
              Dry run (parse + preview only, no DB writes)
            </span>
          </label>
          <label className="mt-6 flex items-center gap-2">
            <Checkbox
              checked={updateExisting}
              onCheckedChange={(c) => setUpdateExisting(!!c)}
            />
            <span className="text-sm">
              Update existing (diff + apply changes to already-imported styles)
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="primary"
            disabled={!file || running}
            onClick={onSubmit}
          >
            <ArrowDownTray />
            {running
              ? "Running…"
              : dryRun
                ? "Preview import"
                : "Run import"}
          </Button>
        </div>
      </div>

      {result ? (
        <div className="flex flex-col gap-3 rounded-md border border-ui-border-base bg-ui-bg-base p-4">
          <Heading level="h2">Result</Heading>
          {result.ok ? (
            <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
              <Stat label="Parsed rows" value={result.parsedRows ?? 0} />
              <Stat label="Products" value={result.groupedProducts ?? 0} />
              <Stat label="To create" value={result.toCreate ?? 0} />
              <Stat label="To update" value={result.toUpdate ?? 0} />
              <Stat label="Created" value={result.created ?? 0} />
              <Stat label="Updated" value={result.updated ?? 0} />
              <Stat label="Variants added" value={result.variantsAdded ?? 0} />
              <Stat label="Errors" value={result.errors ?? 0} />
            </div>
          ) : (
            <Text className="text-ui-fg-error">{result.error}</Text>
          )}

          {result.imageScraperStats ? (
            <Text size="small" className="text-ui-fg-muted">
              Image scraper:{" "}
              <strong>{result.imageScraperStats.cacheHits}</strong> cached,{" "}
              <strong>{result.imageScraperStats.fetched}</strong> fetched,{" "}
              <strong>{result.imageScraperStats.fetchErrors}</strong> errors.
            </Text>
          ) : null}

          {result.warnings && result.warnings.length > 0 ? (
            <details className="rounded-md border border-ui-border-base p-2">
              <summary className="cursor-pointer text-sm font-medium">
                Cross-row drift warnings ({result.warnings.length})
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ui-fg-muted">
                {result.warnings.slice(0, 50).join("\n")}
              </pre>
            </details>
          ) : null}

          {logsBody ? (
            <details className="rounded-md border border-ui-border-base p-2">
              <summary className="cursor-pointer text-sm font-medium">
                Importer log (last 100 lines)
              </summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-ui-fg-muted">
                {logsBody}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </Container>
  )
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border border-ui-border-base p-3">
    <Text size="small" className="text-ui-fg-muted">
      {label}
    </Text>
    <Text size="large" weight="plus" className="mt-1">
      {value.toLocaleString()}
    </Text>
  </div>
)

export const config = defineRouteConfig({
  label: "Gildan Import",
  icon: ArrowDownTray,
})

export default GildanImportPage

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Checkbox, Container, Heading, Text } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  applySpreadsheetHeaderAliases,
  chunkCreates,
} from "../../lib/spreadsheet-sync-import"
import {
  buildBatchUpdatesFromParsedCsv,
  computeProductUpdateColumnCandidates,
  computeProductUpdatePreview,
  PRODUCT_UPDATE_BATCH_CHUNK_SIZE,
  spreadsheetHeadersIgnoringPatchable,
} from "../../lib/spreadsheet-sync-update-import"
import { parseCsv } from "../../lib/csv-import"
import { sdk } from "../../lib/sdk"

const SpreadsheetSyncUpdatePage = () => {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawCsvText, setRawCsvText] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<string[]>([])

  /** Which patchable CSV columns to send to Medusa (subset of analysed candidates). */
  const [enabledList, setEnabledList] = useState<string[]>([])

  const fileAnalysis = useMemo(() => {
    if (!rawCsvText) {
      return null
    }
    let parsed = parseCsv(rawCsvText)
    parsed = applySpreadsheetHeaderAliases(parsed)
    const preview = computeProductUpdatePreview(parsed)
    const extraHeaders = spreadsheetHeadersIgnoringPatchable(parsed)
    const candidates =
      preview.validationErrors.length === 0 ? computeProductUpdateColumnCandidates(parsed) : []
    return { parsed, preview, candidates, extraHeaders }
  }, [rawCsvText])

  const candidatesSig =
    fileAnalysis && fileAnalysis.preview.validationErrors.length === 0
      ? fileAnalysis.candidates.map((c) => c.csvKey).sort().join("\0")
      : ""

  useEffect(() => {
    if (!fileAnalysis || fileAnalysis.preview.validationErrors.length > 0) {
      setEnabledList([])
      return
    }
    setEnabledList(fileAnalysis.candidates.map((c) => c.csvKey))
  }, [rawCsvText, candidatesSig])

  const enabledCsvKeys = useMemo(() => new Set(enabledList), [enabledList])

  const buildOutcome = useMemo(() => {
    if (!fileAnalysis || fileAnalysis.preview.validationErrors.length > 0) {
      return { updates: [] as Record<string, unknown>[], buildErrors: [] as string[] }
    }
    const { updates, errors } = buildBatchUpdatesFromParsedCsv(fileAnalysis.parsed, { enabledCsvKeys })
    return { updates, buildErrors: errors }
  }, [fileAnalysis, enabledCsvKeys])

  const toggleColumn = useCallback((csvKey: string, next: boolean) => {
    setEnabledList((prev) => {
      const has = prev.includes(csvKey)
      if (next && !has) {
        return [...prev, csvKey]
      }
      if (!next && has) {
        return prev.filter((k) => k !== csvKey)
      }
      return prev
    })
  }, [])

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setParseError(null)
    setSyncLog([])
    setRawCsvText(null)
    setFileName(file?.name ?? null)

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setRawCsvText(text)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file")
    }
  }, [])

  const preview = fileAnalysis?.preview ?? null
  const buildErrors = buildOutcome.buildErrors
  const updates = buildOutcome.updates
  const candidates = fileAnalysis?.candidates ?? []
  const extraHeaders = fileAnalysis?.extraHeaders ?? []

  const allChecked =
    candidates.length > 0 && candidates.every((c) => enabledList.includes(c.csvKey))
  const noneChecked = enabledList.length === 0

  const canSync =
    !!fileAnalysis &&
    preview &&
    preview.validationErrors.length === 0 &&
    buildErrors.length === 0 &&
    updates.length > 0 &&
    enabledList.length > 0 &&
    !syncing

  const onSync = useCallback(async () => {
    if (!rawCsvText) {
      return
    }

    let parsed = parseCsv(rawCsvText)
    parsed = applySpreadsheetHeaderAliases(parsed)
    const pre = computeProductUpdatePreview(parsed)
    if (pre.validationErrors.length > 0) {
      return
    }
    const { updates: toUpdate, errors } = buildBatchUpdatesFromParsedCsv(parsed, {
      enabledCsvKeys: new Set(enabledList),
    })
    if (errors.length > 0 || toUpdate.length === 0) {
      return
    }

    setSyncing(true)
    setSyncLog([])

    const log: string[] = []

    try {
      const batches = chunkCreates(toUpdate, PRODUCT_UPDATE_BATCH_CHUNK_SIZE)
      let batchIdx = 0
      for (const chunk of batches) {
        batchIdx++
        log.push(`Batch ${batchIdx}/${batches.length}: updating ${chunk.length} product(s)...`)

        const resp = (await sdk.admin.product.batch(
          { update: chunk as never },
          { fields: "id,handle,title" }
        )) as {
          updated?: Array<{ id?: string; handle?: string; title?: string }>
          products?: Array<{ id?: string; handle?: string; title?: string }>
        }

        const updated = resp.updated ?? resp.products ?? []
        for (const p of updated) {
          const id = p.id ?? "(unknown id)"
          const handle = p.handle ?? ""
          log.push(`  Updated ${id}${handle ? ` (${handle})` : ""}.`)
        }

        if (!updated.length) {
          log.push(`  (No products returned in batch response — check Admin API logs.)`)
        }
      }

      log.push("Done.")
      setSyncLog(log)
    } catch (e) {
      log.push(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
      setSyncLog(log)
    } finally {
      setSyncing(false)
    }
  }, [rawCsvText, enabledList])

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <Heading level="h1">Spreadsheet sync (updates)</Heading>
        <Text size="small" className="text-ui-fg-muted mt-1">
          <strong>Updates existing products only</strong> via <code className="text-xs">sdk.admin.product.batch</code>{" "}
          (<code className="text-xs">update</code>). Each row must include <code className="text-xs">Product Id</code>{" "}
          (<code className="text-xs">prod_…</code>). Choose which spreadsheet columns apply; values come from the first
          row per Product Id (same shape as Medusa&apos;s import template export). Variant-level columns not listed here are
          ignored. To create new products, use{" "}
          <a href="/app/spreadsheet-sync" className="text-ui-fg-interactive hover:underline">
            Spreadsheet sync (new)
          </a>
          .
        </Text>
      </div>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-4">
          <Text weight="plus" size="small">
            1. Upload CSV
          </Text>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onPickFile}
            className="block w-full max-w-md cursor-pointer text-sm text-ui-fg-base file:mr-4 file:rounded-md file:border file:border-ui-border-base file:bg-ui-bg-field file:px-3 file:py-1.5 file:text-sm file:text-ui-fg-base hover:file:bg-ui-bg-field-hover"
          />
          {fileName ? (
            <Text size="small" className="text-ui-fg-muted">
              Selected: {fileName}
            </Text>
          ) : null}
          {parseError ? (
            <Text size="small" className="text-ui-fg-error">
              {parseError}
            </Text>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 px-6 py-4">
          <Text weight="plus" size="small">
            2. Preview
          </Text>
          {!rawCsvText ? (
            <Text size="small" className="text-ui-fg-muted">
              No file loaded yet.
            </Text>
          ) : preview ? (
            <div className="flex flex-col gap-2">
              <Text size="small">
                Products (distinct ids): <strong>{preview.productCount}</strong>
              </Text>
              <Text size="small">
                Variant rows in file: <strong>{preview.variantRowCount}</strong>
              </Text>
              <Text size="small" className="text-ui-fg-muted">
                Rows with the same Product Id should agree on product-level columns; the first row per id wins.
              </Text>

              {preview.validationErrors.length > 0 ? (
                <div className="rounded-md border border-ui-border-error bg-ui-bg-error p-3">
                  <Text size="small" weight="plus" className="text-ui-fg-error">
                    Fix before syncing ({preview.validationErrors.length}{" "}
                    {preview.validationErrors.length === 1 ? "issue" : "issues"}):
                  </Text>
                  <ul className="mt-2 max-h-[min(70vh,28rem)] list-disc overflow-y-auto overscroll-contain pl-5 text-sm text-ui-fg-error">
                    {preview.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.validationErrors.length === 0 ? (
                <div className="mt-2 flex flex-col gap-3 rounded-md border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text weight="plus" size="small">
                      Columns to update
                    </Text>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        disabled={candidates.length === 0}
                        onClick={() => setEnabledList(candidates.map((c) => c.csvKey))}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        disabled={noneChecked}
                        onClick={() => setEnabledList([])}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <Text size="small" className="text-ui-fg-muted">
                    Only columns with at least one non-empty cell on the <strong>first row</strong> of a Product Id are
                    listed. Sync sends only checked fields — every product row must contribute at least one of those cells
                    or validation fails that product.
                  </Text>
                  {candidates.length === 0 ? (
                    <Text size="small" className="text-ui-fg-muted">
                      No recognised product-level patch columns containing data yet (beyond Product Id).
                    </Text>
                  ) : (
                    <ul className="flex max-h-56 flex-col gap-2 overflow-auto">
                      {candidates.map((c) => (
                        <li key={c.csvKey} className="flex items-start gap-2">
                          <Checkbox
                            id={`upd-col-${c.csvKey}`}
                            checked={enabledList.includes(c.csvKey)}
                            onCheckedChange={(v) => toggleColumn(c.csvKey, v === true)}
                          />
                          <label
                            htmlFor={`upd-col-${c.csvKey}`}
                            className="cursor-pointer select-none text-sm leading-tight text-ui-fg-base"
                          >
                            <strong>{c.label}</strong>
                            <span className="ml-2 font-mono text-xs text-ui-fg-muted">{c.csvKey}</span>
                            <span className="ml-2 text-xs text-ui-fg-muted">
                              ({c.affectedProductCount} product
                              {c.affectedProductCount === 1 ? "" : "s"})
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {extraHeaders.length > 0 ? (
                    <Text size="small" className="text-ui-fg-muted">
                      Other columns detected (ignored for updates):{" "}
                      <code className="text-xs">{extraHeaders.slice(0, 24).join(", ")}</code>
                      {extraHeaders.length > 24 ? " …" : null}
                    </Text>
                  ) : null}
                </div>
              ) : null}

              {buildErrors.length > 0 ? (
                <div className="rounded-md border border-ui-border-error bg-ui-bg-error p-3">
                  <Text size="small" weight="plus" className="text-ui-fg-error">
                    Fix before syncing:
                  </Text>
                  <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-sm text-ui-fg-error">
                    {buildErrors.slice(0, 40).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {buildErrors.length > 40 ? <li>…and {buildErrors.length - 40} more</li> : null}
                  </ul>
                </div>
              ) : null}

              {preview.validationErrors.length === 0 && buildErrors.length === 0 && updates.length > 0 ? (
                <Text size="small" className="text-ui-fg-success">
                  Ready — {updates.length} product update(s); {enabledList.length} column
                  {enabledList.length === 1 ? "" : "s"} selected
                  {!allChecked ? " (subset)" : ""}.
                </Text>
              ) : null}

              {preview.validationErrors.length === 0 && buildErrors.length === 0 && updates.length === 0 ? (
                <Text size="small" className="text-ui-fg-muted">
                  {noneChecked || candidates.length === 0
                    ? "Select patch columns above and ensure rows have matching values."
                    : "No updates to apply for the current selection (check row data)."}
                </Text>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 px-6 py-4">
          <Button onClick={onSync} disabled={!canSync} isLoading={syncing}>
            3. Confirm sync
          </Button>
        </div>

        {syncLog.length > 0 ? (
          <div className="flex flex-col gap-2 px-6 py-4">
            <Text weight="plus" size="small">
              Result log
            </Text>
            <Text size="small" className="text-ui-fg-muted">
              From your last <strong>Confirm sync</strong> only.
            </Text>
            <pre className="max-h-96 overflow-auto rounded-md bg-ui-bg-subtle p-3 font-mono text-xs text-ui-fg-base whitespace-pre-wrap">
              {syncLog.join("\n")}
            </pre>
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Spreadsheet sync (updates)",
  rank: 99,
})

export default SpreadsheetSyncUpdatePage

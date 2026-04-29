import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { useCallback, useMemo, useState } from "react"

import {
  buildBatchCreatesFromParsedCsv,
  chunkCreates,
  computeSpreadsheetPreview,
  detectFashionBizVariantCatalog,
  detectGoldCatalogFormat,
  normalizeSpreadsheetForImport,
  PRODUCT_BATCH_CHUNK_SIZE,
} from "../../lib/spreadsheet-sync-import"
import type { TierMoneyMinor } from "../../lib/spreadsheet-money"
import { parseCsv } from "../../lib/csv-import"
import { sdk } from "../../lib/sdk"

const adminFetchPath = (path: string) => {
  const base = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

type TierApplyResult = { variant_id: string; ok: boolean; message?: string }

const SpreadsheetSyncPage = () => {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawCsvText, setRawCsvText] = useState<string | null>(null)
  const [defaultShippingProfileId, setDefaultShippingProfileId] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [tierResults, setTierResults] = useState<TierApplyResult[] | null>(null)

  const normalized = useMemo(() => {
    if (!rawCsvText) {
      return null
    }
    const rawParsed = parseCsv(rawCsvText)
    return normalizeSpreadsheetForImport(rawParsed, { defaultShippingProfileId })
  }, [rawCsvText, defaultShippingProfileId])

  const importHints = normalized?.hints ?? []

  const preview = useMemo(() => {
    if (!normalized) {
      return null
    }
    if (normalized.readyParsed) {
      return computeSpreadsheetPreview(normalized.readyParsed)
    }
    const needsShippingOnly =
      !defaultShippingProfileId.trim() &&
      (detectFashionBizVariantCatalog(normalized.rawParsed) ||
        detectGoldCatalogFormat(normalized.rawParsed))
    if (needsShippingOnly) {
      return {
        productCount: 0,
        variantCount: normalized.rawParsed.rows.length,
        tierRuleCount: 0,
        validationErrors: [] as string[],
      }
    }
    return computeSpreadsheetPreview(normalized.rawParsed)
  }, [normalized, defaultShippingProfileId])

  const readyParsed = normalized?.readyParsed ?? null

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setParseError(null)
    setSyncLog([])
    setTierResults(null)
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

  const canSync =
    !!readyParsed &&
    preview &&
    preview.validationErrors.length === 0 &&
    preview.productCount > 0 &&
    !syncing

  const onSync = useCallback(async () => {
    if (!rawCsvText) {
      return
    }

    const rawParsed = parseCsv(rawCsvText)
    const { readyParsed: toSync } = normalizeSpreadsheetForImport(rawParsed, {
      defaultShippingProfileId,
    })
    if (!toSync) {
      return
    }

    setSyncing(true)
    setSyncLog([])
    setTierResults(null)

    const log: string[] = []
    const { creates, tierBySku, errors } = buildBatchCreatesFromParsedCsv(toSync)

    if (errors.length) {
      errors.forEach((e) => log.push(`Validation: ${e}`))
      setSyncLog(log)
      setSyncing(false)
      return
    }

    if (!creates.length) {
      log.push("Nothing to create — no product groups found.")
      setSyncLog(log)
      setSyncing(false)
      return
    }

    const tierPayload: Array<{ variant_id: string; tiers_minor: TierMoneyMinor }> = []

    try {
      const batches = chunkCreates(creates, PRODUCT_BATCH_CHUNK_SIZE)
      let batchIdx = 0
      for (const chunk of batches) {
        batchIdx++
        log.push(`Batch ${batchIdx}/${batches.length}: creating ${chunk.length} product(s)...`)

        const resp = (await sdk.admin.product.batch(
          { create: chunk as never },
          { fields: "handle,+variants.id,+variants.sku" }
        )) as {
          created?: Array<{ handle?: string; variants?: Array<{ id?: string; sku?: string | null }> }>
          products?: Array<{ handle?: string; variants?: Array<{ id?: string; sku?: string | null }> }>
        }

        const created = resp.created ?? resp.products ?? []
        for (const product of created) {
          const handle = product.handle ?? "(unknown handle)"
          const variants = product.variants ?? []
          log.push(`  Created "${handle}" (${variants.length} variant(s)).`)

          for (const v of variants) {
            const sku = (v.sku ?? "").trim()
            const tiers = sku ? tierBySku.get(sku) : undefined
            if (tiers && v.id) {
              tierPayload.push({ variant_id: v.id, tiers_minor: tiers })
            }
          }
        }
      }

      if (tierPayload.length) {
        log.push(`Applying AUD tier ladders for ${tierPayload.length} variant(s)...`)

        const tierChunks = chunkCreates(tierPayload, 40)
        const allTierResults: TierApplyResult[] = []

        let tc = 0
        for (const tchunk of tierChunks) {
          tc++
          const res = await fetch(adminFetchPath("/admin/spreadsheet-sync/apply-variant-tier-prices"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: tchunk }),
          })

          if (!res.ok) {
            const msg = await res.text()
            log.push(`Tier batch ${tc} failed: HTTP ${res.status} ${msg}`)
            continue
          }

          const body = (await res.json()) as { results?: TierApplyResult[] }
          const results = body.results ?? []
          allTierResults.push(...results)

          const failed = results.filter((r) => !r.ok)
          if (failed.length) {
            failed.forEach((f) =>
              log.push(`  Tier failed ${f.variant_id}: ${f.message ?? "unknown error"}`)
            )
          }
        }

        setTierResults(allTierResults)

        const okN = allTierResults.filter((r) => r.ok).length
        const bad = allTierResults.filter((r) => !r.ok).length
        log.push(`Tier pricing finished: ${okN} ok, ${bad} failed.`)
      } else {
        log.push("No tier ladders to apply (use tier columns or flat AUD prices only).")
      }

      log.push("Done.")
      setSyncLog(log)
    } catch (e) {
      log.push(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
      setSyncLog(log)
    } finally {
      setSyncing(false)
    }
  }, [rawCsvText, defaultShippingProfileId])

  const goldNeedsShipping =
    !!normalized &&
    detectGoldCatalogFormat(normalized.rawParsed) &&
    !defaultShippingProfileId.trim()

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <Heading level="h1">Spreadsheet sync</Heading>
        <Text size="small" className="text-ui-fg-muted mt-1">
          Prefer the CSV from <strong>Products → Export products (import template)</strong>. Wholesale feeds such as AS
          Colour (STYLECODE / PRODUCT_NAME / PRICE) are mapped automatically once you set a default shipping profile.
          Sync uses <code className="text-xs">sdk.admin.product.batch</code> and optional AUD tier pricing via the Pricing
          Module.
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
            Default shipping profile id
          </Text>
          <Input
            placeholder="e.g. sp_01..."
            value={defaultShippingProfileId}
            onChange={(e) => setDefaultShippingProfileId(e.target.value)}
            className="max-w-md"
          />
          <Text size="small" className="text-ui-fg-muted">
            Required for wholesale CSVs that omit <code className="text-xs">Shipping Profile Id</code>. Copy from{" "}
            <strong>Settings → Locations &amp; shipping → Shipping profiles</strong>.
          </Text>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4">
          <Text weight="plus" size="small">
            2. Preview
          </Text>
          {!rawCsvText ? (
            <Text size="small" className="text-ui-fg-muted">
              No file loaded yet.
            </Text>
          ) : (
            <div className="flex flex-col gap-3">
              {importHints.map((hint, i) => (
                <div
                  key={i}
                  className="rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm text-ui-fg-subtle"
                >
                  {hint}
                </div>
              ))}
              {goldNeedsShipping ? (
                <Text size="small" className="text-ui-fg-muted">
                  Enter your shipping profile id above — the preview will switch to Medusa-ready rows (handles like{" "}
                  <code className="text-xs">ascolour-1000</code>).
                </Text>
              ) : null}
              {preview ? (
                <div className="flex flex-col gap-2">
                  <Text size="small">
                    Products (distinct handles): <strong>{preview.productCount}</strong>
                  </Text>
                  <Text size="small">
                    Variant rows: <strong>{preview.variantCount}</strong>
                  </Text>
                  <Text size="small">
                    Tier pricing rules (four supplemental tier columns): <strong>{preview.tierRuleCount}</strong>
                  </Text>
                  {preview.validationErrors.length ? (
                    <div className="rounded-md border border-ui-border-error bg-ui-bg-error p-3">
                      <Text size="small" weight="plus" className="text-ui-fg-error">
                        Fix before syncing:
                      </Text>
                      <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-sm text-ui-fg-error">
                        {preview.validationErrors.slice(0, 40).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {preview.validationErrors.length > 40 ? (
                          <li>…and {preview.validationErrors.length - 40} more</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : readyParsed ? (
                    <Text size="small" className="text-ui-fg-success">
                      Looks valid — click Sync to push to Medusa.
                    </Text>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onSync} disabled={!canSync} isLoading={syncing}>
              3. Confirm sync
            </Button>
            {!canSync && readyParsed && preview?.validationErrors.length === 0 && preview.productCount === 0 ? (
              <Text size="small" className="text-ui-fg-muted">
                No rows to sync.
              </Text>
            ) : null}
            {!canSync && goldNeedsShipping ? (
              <Text size="small" className="text-ui-fg-muted">
                Add shipping profile id to enable sync.
              </Text>
            ) : null}
          </div>
        </div>

        {syncLog.length > 0 ? (
          <div className="flex flex-col gap-2 px-6 py-4">
            <Text weight="plus" size="small">
              Result log
            </Text>
            <pre className="max-h-96 overflow-auto rounded-md bg-ui-bg-subtle p-3 font-mono text-xs text-ui-fg-base whitespace-pre-wrap">
              {syncLog.join("\n")}
            </pre>
            {tierResults?.length ? (
              <Text size="small" className="text-ui-fg-muted">
                Tier rows processed: {tierResults.length}. Failed: {tierResults.filter((r) => !r.ok).length}.
              </Text>
            ) : null}
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Spreadsheet sync",
  rank: 99,
})

export default SpreadsheetSyncPage

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Text } from "@medusajs/ui"
import { Component, type ReactNode, useCallback, useState } from "react"

import { buildCsv, downloadCsv, fetchAllPaginated } from "../lib/csv-export"
import {
  buildProductImportTemplateRows,
  PRODUCT_IMPORT_CSV_HEADERS,
  PRODUCT_IMPORT_EXPORT_LIST_FIELDS,
} from "../lib/product-import-template-csv"
import { sdk } from "../lib/sdk"

const todayStamp = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

type ProductListQuery = {
  limit: number
  offset: number
  fields: string
  order: string
}

/** Prevent a widget render failure from blanking the core Products table (Medusa mounts list widgets above the table). */
class ProductsImportTemplateExportBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <Container className="mt-4 divide-y p-0">
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              Export widget error
            </Text>
            <Text size="small" className="mt-1 text-ui-fg-muted">
              {this.state.error.message}
            </Text>
          </div>
        </Container>
      )
    }
    return this.props.children
  }
}

const ProductsImportTemplateExportInner = () => {
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSummary, setExportSummary] = useState<string | null>(null)

  const onExport = useCallback(async () => {
    setExportError(null)
    setExportSummary(null)
    setExportLoading(true)
    try {
      const products = await fetchAllPaginated<
        Record<string, unknown>,
        ProductListQuery
      >(
        (q) =>
          sdk.admin.product.list(q) as unknown as Promise<
            { count?: number } & Record<string, unknown>
          >,
        "products",
        { fields: PRODUCT_IMPORT_EXPORT_LIST_FIELDS, order: "created_at" }
      )

      const rows = buildProductImportTemplateRows(products)

      if (rows.length === 0) {
        setExportSummary(
          products.length === 0
            ? "No products to export."
            : "No variants found (products without variants are skipped)."
        )
        return
      }

      const csv = buildCsv(PRODUCT_IMPORT_CSV_HEADERS, rows)
      downloadCsv(`products-import-template-${todayStamp()}.csv`, csv)
      setExportSummary(
        `Exported ${rows.length} variant ${rows.length === 1 ? "row" : "rows"} (${products.length} ${products.length === 1 ? "product" : "products"} loaded).`
      )
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExportLoading(false)
    }
  }, [])

  return (
    <Container className="mt-4 divide-y p-0">
      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text size="small" weight="plus" className="text-ui-fg-base">
            Export products (import template)
          </Text>
          <Text size="small" className="text-ui-fg-muted">
            CSV matching Medusa product-import columns (one row per variant). After collection title,
            type value, sales channel id, and tag id, includes AUD tier columns (Variant Price AUD,
            BASE_SALE_PRICE, TIER_10_TO_19_PRICE, TIER_20_TO_49_PRICE, TIER_50_TO_99_PRICE,
            TIER_100_PLUS_PRICE, legacy TIER_10_TO_49_PRICE) and Variant Bulk Pricing JSON when
            metadata is present.
          </Text>
        </div>
        <Button size="small" variant="secondary" disabled={exportLoading} onClick={onExport}>
          {exportLoading ? "Exporting…" : "Export import-template CSV"}
        </Button>
      </div>
      {exportError ? (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-error">
            {exportError}
          </Text>
        </div>
      ) : null}
      {exportSummary ? (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            {exportSummary}
          </Text>
        </div>
      ) : null}
    </Container>
  )
}

/** Medusa passes `data` for detail widgets; product list has no row context (`data` is undefined). */
const ProductsImportTemplateExport = (props: { data?: unknown }) => {
  void props.data
  return (
    <ProductsImportTemplateExportBoundary>
      <ProductsImportTemplateExportInner />
    </ProductsImportTemplateExportBoundary>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.after",
})

export default ProductsImportTemplateExport

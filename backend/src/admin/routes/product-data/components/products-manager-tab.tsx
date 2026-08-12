import {
  Badge,
  Button,
  Checkbox,
  Container,
  DropdownMenu,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { HelpTooltip } from "../../../components/reports/help-tooltip"
import ImageScanControl from "./image-scan-control"
import {
  MultiSelectPicker,
  type MultiSelectOption,
} from "../../../components/multi-select-picker"
import { sdk } from "../../../lib/sdk"
import { buildCsv, downloadCsv } from "../../../lib/csv-export"

/**
 * "Browse & manage" tab in /app/product-data.
 *
 * Replaces the old "Bulk delete" tab. Adds rich filtering (brand, type,
 * tags, categories, collections, sales channels, date range, search,
 * data-quality flags) and multi-select-driven bulk actions (status,
 * delete, brand, type, tags, sales channels, categories, collection,
 * CSV export).
 *
 * Selection survives pagination — selectedIds is a Set keyed by product
 * id, never cleared by page changes (only by an explicit "Clear" or by
 * a completed bulk action that pulled the rug out from under selected
 * rows). "Select all matching filter" populates the Set with the
 * server-trimmed candidate list (capped at 1000) instead of doing
 * cross-page virtual selection.
 */

/* ─────────────── constants ─────────────── */

const PAGE_SIZES = [25, 50, 100, 200] as const

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "proposed", label: "Proposed" },
  { value: "rejected", label: "Rejected" },
] as const

const QUALITY_FLAGS = [
  { value: "image", label: "Missing image" },
  { value: "broken_image", label: "Broken image" },
  { value: "below_cost", label: "Below cost" },
  { value: "description", label: "Missing description" },
  { value: "type", label: "Missing type" },
  { value: "tags", label: "Missing tags" },
  { value: "brand", label: "Missing brand" },
  { value: "sales_channel", label: "Missing sales channel" },
  { value: "shop_category", label: "Missing shop category" },
] as const

const QUALITY_KEYS = [
  "has_image",
  "has_description",
  "has_type",
  "has_tags",
  "has_brand",
  "has_sales_channel",
  "has_shop_category",
] as const

const QUALITY_LABELS: Record<(typeof QUALITY_KEYS)[number], string> = {
  has_image: "Image",
  has_description: "Description",
  has_type: "Type",
  has_tags: "Tags",
  has_brand: "Brand",
  has_sales_channel: "Sales channel",
  has_shop_category: "Shop category",
}

const SELECT_ALL_HARD_CAP = 1000

type QualityFlag = (typeof QUALITY_FLAGS)[number]["value"]
type ProductStatus = (typeof STATUS_OPTIONS)[number]["value"]
type SortKey =
  | "title"
  | "-title"
  | "created_at"
  | "-created_at"
  | "status"
  | "-status"

// `broken_image` is a separate axis from the has_X "missing" signals
// (true = thumbnail present but its URL is dead), so it lives outside
// QUALITY_KEYS and is rendered/handled on its own.
type Quality = Record<(typeof QUALITY_KEYS)[number], boolean> & {
  broken_image?: boolean
  // Some variant's 100+ tier prices below its cash cost (pricing audit stamp).
  below_cost?: boolean
}

type Product = {
  id: string
  title: string | null
  handle: string | null
  thumbnail: string | null
  status: string | null
  created_at: string | null
  variant_count: number
  type: { id: string; value: string | null } | null
  tags: Array<{ id: string; value: string }>
  category_count: number
  category_ids: string[]
  collection: { id: string; handle: string | null; title: string | null } | null
  sales_channel_count: number
  sales_channels: Array<{ id: string; name: string | null }>
  brand: { id: string; name: string | null; handle: string | null } | null
  print_profile: string | null
  quality: Quality
}

/** "short-sleeve-garment" → "Short Sleeve Garment"; "custom" → "Custom". */
const humanizeProfileHandle = (handle: string | null): string => {
  if (!handle) return "—"
  if (handle === "custom") return "Custom"
  return handle
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

type Filters = {
  status: ProductStatus[]
  brand_ids: string[]
  type_ids: string[]
  tag_ids: string[]
  category_ids: string[]
  collection_ids: string[]
  sales_channel_ids: string[]
  created_from: string
  created_to: string
  q: string
  missing: QualityFlag[]
}

const EMPTY_FILTERS: Filters = {
  status: [],
  brand_ids: [],
  type_ids: [],
  tag_ids: [],
  category_ids: [],
  collection_ids: [],
  sales_channel_ids: [],
  created_from: "",
  created_to: "",
  q: "",
  missing: [],
}

type BulkActionKey =
  | "change_status"
  | "set_brand"
  | "set_type"
  | "set_tags"
  | "set_sales_channels"
  | "set_categories"
  | "set_collection"
  | "set_print_profile"

type BulkResult = {
  succeeded: string[]
  failed: Array<{ id: string; error: string }>
  total: number
}

const ACTION_LABELS: Record<BulkActionKey, string> = {
  change_status: "Change status",
  set_brand: "Set brand",
  set_type: "Set type",
  set_tags: "Tags…",
  set_sales_channels: "Sales channels…",
  set_categories: "Categories…",
  set_collection: "Set collection",
  set_print_profile: "Set print profile",
}

/* ─────────────── component ─────────────── */

const ProductsManagerTab = () => {
  const prompt = usePrompt()

  /* ─ filter options (loaded once) ─ */
  const [brandOptions, setBrandOptions] = useState<MultiSelectOption[]>([])
  const [printProfileOptions, setPrintProfileOptions] = useState<MultiSelectOption[]>([])
  const [typeOptions, setTypeOptions] = useState<MultiSelectOption[]>([])
  const [tagOptions, setTagOptions] = useState<MultiSelectOption[]>([])
  const [categoryOptions, setCategoryOptions] = useState<MultiSelectOption[]>(
    []
  )
  const [collectionOptions, setCollectionOptions] = useState<
    MultiSelectOption[]
  >([])
  const [salesChannelOptions, setSalesChannelOptions] = useState<
    MultiSelectOption[]
  >([])

  /* ─ filters + pagination ─ */
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [searchDraft, setSearchDraft] = useState("")
  const [sort, setSort] = useState<SortKey>("-created_at")
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZES)[number]>(50)

  /* ─ products + loading state ─ */
  const [products, setProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  /* ─ selection ─ */
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>())

  /* ─ active bulk-action modal ─ */
  const [activeAction, setActiveAction] = useState<BulkActionKey | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  // Remembers the last bulk run's action + payload so the result modal's
  // "Retry failed" button can re-issue the same operation on just the
  // failures. "delete" is recorded too so the button hides after a
  // destructive run (we don't silently re-delete).
  const [lastBulk, setLastBulk] = useState<{
    action: BulkActionKey | "delete"
    payload: Record<string, unknown>
  } | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  /* ─ derived ─ */
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const pageIndex = Math.floor(offset / pageSize)
  const visibleStart = totalCount === 0 ? 0 : offset + 1
  const visibleEnd =
    totalCount === 0 ? 0 : Math.min(offset + products.length, totalCount)

  const headerChecked = useMemo((): boolean | "indeterminate" => {
    if (products.length === 0) return false
    const onPage = products.filter((p) => selectedIds.has(p.id))
    if (onPage.length === 0) return false
    if (onPage.length === products.length) return true
    return "indeterminate"
  }, [products, selectedIds])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.status.length) n++
    if (filters.brand_ids.length) n++
    if (filters.type_ids.length) n++
    if (filters.tag_ids.length) n++
    if (filters.category_ids.length) n++
    if (filters.collection_ids.length) n++
    if (filters.sales_channel_ids.length) n++
    if (filters.created_from) n++
    if (filters.created_to) n++
    if (filters.q) n++
    if (filters.missing.length) n++
    return n
  }, [filters])

  /* ─ load filter options once ─ */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [types, tags, cats, cols, chans, brands, printProfiles] = await Promise.all([
          sdk.admin.productType.list({ limit: 500, offset: 0 }),
          sdk.admin.productTag.list({ limit: 500, offset: 0 }),
          (sdk.admin as any).productCategory.list({
            limit: 500,
            offset: 0,
          }) as Promise<any>,
          (sdk.admin as any).productCollection.list({
            limit: 200,
            offset: 0,
          }) as Promise<any>,
          (sdk.admin as any).salesChannel.list({
            limit: 50,
            offset: 0,
          }) as Promise<any>,
          fetch("/admin/brands?limit=500", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : { brands: [] }))
            .catch(() => ({ brands: [] })),
          fetch("/admin/print-profiles", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : { print_profiles: [] }))
            .catch(() => ({ print_profiles: [] })),
        ])
        if (cancelled) return
        setPrintProfileOptions(
          ((printProfiles as any).print_profiles ?? []).map((p: any) => ({
            value: p.handle,
            label: p.name ?? p.handle,
          }))
        )
        setTypeOptions(
          ((types as any).product_types ?? []).map((t: any) => ({
            value: t.id,
            label: t.value ?? t.id,
          }))
        )
        setTagOptions(
          ((tags as any).product_tags ?? []).map((t: any) => ({
            value: t.id,
            label: t.value ?? t.id,
          }))
        )
        setCategoryOptions(
          ((cats as any).product_categories ?? []).map((c: any) => ({
            value: c.id,
            label: c.name ?? c.handle ?? c.id,
          }))
        )
        setCollectionOptions(
          ((cols as any).collections ?? []).map((c: any) => ({
            value: c.id,
            label: c.title ?? c.handle ?? c.id,
          }))
        )
        setSalesChannelOptions(
          ((chans as any).sales_channels ?? []).map((c: any) => ({
            value: c.id,
            label: c.name ?? c.id,
          }))
        )
        setBrandOptions(
          ((brands as any).brands ?? []).map((b: any) => ({
            value: b.id,
            label: b.name ?? b.id,
            hint: b.external_code ?? null,
          }))
        )
      } catch (err: any) {
        if (!cancelled) {
          toast.warning(
            `Some filter options failed to load: ${err?.message ?? err}`
          )
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  /* ─ debounce search → filter ─ */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => (f.q === searchDraft.trim() ? f : { ...f, q: searchDraft.trim() }))
    }, 350)
    return () => window.clearTimeout(t)
  }, [searchDraft])

  /* ─ reset offset on filter changes ─ */
  useEffect(() => {
    setOffset(0)
  }, [filters, sort, pageSize])

  /* ─ load products on filter / sort / page change ─ */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const body = buildListBody(filters, sort, pageSize, offset, false, 0)
        const res = await fetch("/admin/products-manager/list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
        }
        const data = await res.json()
        if (cancelled) return
        const rows = (data.products ?? []) as Product[]
        if (rows.length === 0 && offset > 0) {
          setOffset(Math.max(0, offset - pageSize))
          return
        }
        setProducts(rows)
        setTotalCount(data.count ?? rows.length)
        setTruncated(!!data.truncated)
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message ?? "Could not load products."
          setLoadError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [filters, sort, pageSize, offset, refreshNonce])

  /* ─ selection helpers ─ */
  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of products) {
          if (checked) next.add(p.id)
          else next.delete(p.id)
        }
        return next
      })
    },
    [products]
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectAllMatching = useCallback(async () => {
    try {
      const body = buildListBody(
        filters,
        sort,
        pageSize,
        offset,
        true,
        SELECT_ALL_HARD_CAP
      )
      const res = await fetch("/admin/products-manager/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const ids = (data.ids ?? []) as string[]
      setSelectedIds(new Set(ids))
      if (data.truncated) {
        toast.warning(
          `Selected the first ${ids.length}. Split into batches if you need to act on the rest.`
        )
      } else {
        toast.success(
          `Selected ${ids.length} matching product${ids.length === 1 ? "" : "s"}.`
        )
      }
    } catch (err: any) {
      toast.error(`Select all failed: ${err?.message ?? err}`)
    }
  }, [filters, sort, pageSize, offset])

  /* ─ filter mutators ─ */
  const setFilter = <K extends keyof Filters>(
    key: K,
    value: Filters[K]
  ) => {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    setSearchDraft("")
  }

  /* ─ bulk-action runner ─ */
  const runBulkAction = useCallback(
    async (
      key: BulkActionKey,
      payload: Record<string, unknown>
    ): Promise<BulkResult | null> => {
      const ids = [...selectedIds]
      if (ids.length === 0) {
        toast.error("No products selected.")
        return null
      }
      setLastBulk({ action: key, payload })
      try {
        const res = await fetch("/admin/products-manager/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            product_ids: ids,
            action: key,
            payload,
          }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
        }
        const data = (await res.json()) as BulkResult
        const okCount = data.succeeded.length
        const failCount = data.failed.length
        if (failCount === 0) {
          toast.success(
            `${ACTION_LABELS[key]}: ${okCount} succeeded.`
          )
          // Clear selection only on a clean run; on partial failure we
          // keep the selection so the user can retry the failed.
          setSelectedIds(new Set())
        } else {
          toast.warning(
            `${ACTION_LABELS[key]}: ${okCount} succeeded, ${failCount} failed.`
          )
        }
        setRefreshNonce((n) => n + 1)
        return data
      } catch (err: any) {
        toast.error(`Bulk action failed: ${err?.message ?? err}`)
        return null
      }
    },
    [selectedIds]
  )

  const runDelete = useCallback(async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const confirmed = await prompt({
      variant: "danger",
      title: "Permanently delete products",
      description: `You are about to delete ${ids.length} product${ids.length === 1 ? "" : "s"}. Variants, prices, and link rows go with them. There is no undo.`,
      verificationText: "DELETE",
      verificationInstruction: "Type DELETE to confirm.",
      confirmText: "Delete products",
      cancelText: "Cancel",
    })
    if (!confirmed) return
    // Record the run so the result modal's retry button hides for deletes
    // (a stale non-delete action must not be re-applied to the failed rows).
    setLastBulk({ action: "delete", payload: {} })
    try {
      const res = await fetch("/admin/products-manager/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          product_ids: ids,
          action: "delete",
          payload: {},
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = (await res.json()) as BulkResult
      setBulkResult(data)
      if (data.failed.length === 0) {
        toast.success(`Deleted ${data.succeeded.length} product(s).`)
        setSelectedIds(new Set())
      } else {
        toast.warning(
          `Deleted ${data.succeeded.length}, failed ${data.failed.length}.`
        )
      }
      setRefreshNonce((n) => n + 1)
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message ?? err}`)
    }
  }, [prompt, selectedIds])

  /* ─ CSV export ─ */
  const exportSelected = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      toast.error("Select at least one product.")
      return
    }
    const selectedRows = products.filter((p) => selectedIds.has(p.id))
    // We can only export what's on the current page right now. Promote
    // to a server-side export when staff need to export cross-page.
    if (selectedRows.length < ids.length) {
      toast.warning(
        `Exporting the ${selectedRows.length} selected rows on this page. Re-run after paginating for the rest.`
      )
    }
    const header = [
      "id",
      "title",
      "handle",
      "status",
      "brand",
      "type",
      "tags",
      "categories",
      "sales_channels",
      "variants",
      "created_at",
    ]
    const csv = buildCsv(
      header,
      selectedRows.map((p) => [
        p.id,
        p.title ?? "",
        p.handle ?? "",
        p.status ?? "",
        p.brand?.name ?? "",
        p.type?.value ?? "",
        p.tags.map((t) => t.value).join("|"),
        String(p.category_count),
        p.sales_channels.map((s) => s.name ?? s.id).join("|"),
        String(p.variant_count),
        p.created_at ?? "",
      ])
    )
    downloadCsv(`products-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }, [products, selectedIds])

  /* ─ retry failed ─ */
  const retryFailed = useCallback(
    async (
      action: BulkActionKey | "delete",
      payload: Record<string, unknown>
    ) => {
      if (!bulkResult) return
      const ids = bulkResult.failed.map((f) => f.id)
      if (ids.length === 0) return
      try {
        const res = await fetch("/admin/products-manager/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ product_ids: ids, action, payload }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
        }
        const data = (await res.json()) as BulkResult
        setBulkResult(data)
        if (data.failed.length === 0) {
          toast.success(`Retry succeeded for ${data.succeeded.length}.`)
        } else {
          toast.warning(`${data.succeeded.length} ok, ${data.failed.length} still failed.`)
        }
        setRefreshNonce((n) => n + 1)
      } catch (err: any) {
        toast.error(`Retry failed: ${err?.message ?? err}`)
      }
    },
    [bulkResult]
  )

  /* ─────────────── render ─────────────── */

  // "Retry failed" re-runs the last bulk action on just the failed products.
  // Only offered for non-destructive actions that left at least one failure.
  const retryHandler =
    bulkResult &&
    lastBulk &&
    lastBulk.action !== "delete" &&
    bulkResult.failed.length > 0
      ? () => retryFailed(lastBulk.action, lastBulk.payload)
      : undefined

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        filters={filters}
        setFilter={setFilter}
        searchDraft={searchDraft}
        setSearchDraft={setSearchDraft}
        sort={sort}
        setSort={setSort}
        brandOptions={brandOptions}
        typeOptions={typeOptions}
        tagOptions={tagOptions}
        categoryOptions={categoryOptions}
        collectionOptions={collectionOptions}
        salesChannelOptions={salesChannelOptions}
        activeFilterCount={activeFilterCount}
        resetFilters={resetFilters}
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        totalMatching={totalCount}
        truncated={truncated}
        onSelectAllMatching={selectAllMatching}
        onClearSelection={clearSelection}
        onPickAction={setActiveAction}
        onDelete={runDelete}
        onExport={exportSelected}
        onAiDescriptions={() => setAiModalOpen(true)}
        disabled={loading}
      />

      <ResultsTable
        products={products}
        loading={loading}
        loadError={loadError}
        selectedIds={selectedIds}
        toggleOne={toggleOne}
        toggleAllOnPage={toggleAllOnPage}
        headerChecked={headerChecked}
      />

      <PaginationBar
        offset={offset}
        pageSize={pageSize}
        totalCount={totalCount}
        visibleStart={visibleStart}
        visibleEnd={visibleEnd}
        pageIndex={pageIndex}
        pageCount={pageCount}
        loading={loading}
        truncated={truncated}
        canPrev={offset > 0 && !loading}
        canNext={
          !loading && totalCount > 0 && offset + products.length < totalCount
        }
        onPrev={() => setOffset(Math.max(0, offset - pageSize))}
        onNext={() => setOffset(offset + pageSize)}
        onPageSize={(s) => setPageSize(s)}
      />

      {activeAction ? (
        <ActionConfigModal
          actionKey={activeAction}
          selectedCount={selectedIds.size}
          selectedProducts={products.filter((p) => selectedIds.has(p.id))}
          onClose={() => setActiveAction(null)}
          onConfirm={async (payload) => {
            const result = await runBulkAction(activeAction, payload)
            setActiveAction(null)
            if (result) setBulkResult(result)
          }}
          brandOptions={brandOptions}
          typeOptions={typeOptions}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          collectionOptions={collectionOptions}
          salesChannelOptions={salesChannelOptions}
          printProfileOptions={printProfileOptions}
        />
      ) : null}

      {bulkResult ? (
        <ResultModal
          result={bulkResult}
          onClose={() => setBulkResult(null)}
          onRetry={retryHandler}
        />
      ) : null}

      {aiModalOpen ? (
        <AiDescriptionModal
          selectedIds={[...selectedIds]}
          loadedProducts={products}
          onClose={() => setAiModalOpen(false)}
          onComplete={(cleanRun) => {
            setRefreshNonce((n) => n + 1)
            if (cleanRun) setSelectedIds(new Set())
          }}
        />
      ) : null}
    </div>
  )
}

/* ─────────────── helpers ─────────────── */

function buildListBody(
  filters: Filters,
  sort: SortKey,
  pageSize: number,
  offset: number,
  idsOnly: boolean,
  idsLimit: number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    limit: pageSize,
    offset,
    order: sort,
  }
  if (filters.status.length) body.status = filters.status
  if (filters.brand_ids.length) body.brand_ids = filters.brand_ids
  if (filters.type_ids.length) body.type_ids = filters.type_ids
  if (filters.tag_ids.length) body.tag_ids = filters.tag_ids
  if (filters.category_ids.length) body.category_ids = filters.category_ids
  if (filters.collection_ids.length)
    body.collection_ids = filters.collection_ids
  if (filters.sales_channel_ids.length)
    body.sales_channel_ids = filters.sales_channel_ids
  if (filters.created_from) body.created_from = filters.created_from
  if (filters.created_to) body.created_to = filters.created_to
  if (filters.q) body.q = filters.q
  if (filters.missing.length) body.missing = filters.missing
  if (idsOnly) {
    body.ids_only = true
    body.ids_limit = idsLimit
  }
  return body
}

/* ─────────────── filter bar ─────────────── */

type FilterBarProps = {
  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  searchDraft: string
  setSearchDraft: (v: string) => void
  sort: SortKey
  setSort: (s: SortKey) => void
  brandOptions: MultiSelectOption[]
  typeOptions: MultiSelectOption[]
  tagOptions: MultiSelectOption[]
  categoryOptions: MultiSelectOption[]
  collectionOptions: MultiSelectOption[]
  salesChannelOptions: MultiSelectOption[]
  activeFilterCount: number
  resetFilters: () => void
}

const FilterBar = (props: FilterBarProps) => {
  return (
    <Container className="p-0">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Text weight="plus" size="small">
            Filters {props.activeFilterCount ? `(${props.activeFilterCount})` : ""}
          </Text>
          {props.activeFilterCount > 0 ? (
            <Button
              variant="secondary"
              size="small"
              onClick={props.resetFilters}
            >
              Reset all
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label size="xsmall">Search</Label>
            <Input
              type="search"
              placeholder="Title contains…"
              value={props.searchDraft}
              onChange={(e) => props.setSearchDraft(e.target.value)}
              size="small"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Status</Label>
            <MultiSelectPicker
              options={[...STATUS_OPTIONS]}
              selected={props.filters.status}
              onChange={(v) => props.setFilter("status", v as ProductStatus[])}
              placeholder="Any status"
              searchable={false}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall" className="flex items-center">
              Brand
              <HelpTooltip
                text={{
                  title: "Brand filter",
                  body: "Reads the Brand → Product module link (the single source of truth for brand identity across the storefront, reports, and supplier menus).",
                  bullets: [
                    "Pick one or more brands to see only products linked to them.",
                    "Pair with 'Missing brand' below to spot products with no brand entity attached — these are usually freshly-imported supplier products that need their brand re-linked.",
                  ],
                }}
              />
            </Label>
            <MultiSelectPicker
              options={props.brandOptions}
              selected={props.filters.brand_ids}
              onChange={(v) => props.setFilter("brand_ids", v)}
              placeholder="Any brand"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Type</Label>
            <MultiSelectPicker
              options={props.typeOptions}
              selected={props.filters.type_ids}
              onChange={(v) => props.setFilter("type_ids", v)}
              placeholder="Any type"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Tags</Label>
            <MultiSelectPicker
              options={props.tagOptions}
              selected={props.filters.tag_ids}
              onChange={(v) => props.setFilter("tag_ids", v)}
              placeholder="Any tag"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Shop category</Label>
            <MultiSelectPicker
              options={props.categoryOptions}
              selected={props.filters.category_ids}
              onChange={(v) => props.setFilter("category_ids", v)}
              placeholder="Any category"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Collection</Label>
            <MultiSelectPicker
              options={props.collectionOptions}
              selected={props.filters.collection_ids}
              onChange={(v) => props.setFilter("collection_ids", v)}
              placeholder="Any collection"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Sales channel</Label>
            <MultiSelectPicker
              options={props.salesChannelOptions}
              selected={props.filters.sales_channel_ids}
              onChange={(v) => props.setFilter("sales_channel_ids", v)}
              placeholder="Any channel"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Created from</Label>
            <Input
              type="date"
              value={props.filters.created_from}
              onChange={(e) =>
                props.setFilter("created_from", e.target.value)
              }
              size="small"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Created to</Label>
            <Input
              type="date"
              value={props.filters.created_to}
              onChange={(e) => props.setFilter("created_to", e.target.value)}
              size="small"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="xsmall">Sort by</Label>
            <Select
              value={props.sort}
              onValueChange={(v) => props.setSort(v as SortKey)}
              size="small"
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="-created_at">Newest first</Select.Item>
                <Select.Item value="created_at">Oldest first</Select.Item>
                <Select.Item value="title">Title A → Z</Select.Item>
                <Select.Item value="-title">Title Z → A</Select.Item>
                <Select.Item value="status">Status A → Z</Select.Item>
                <Select.Item value="-status">Status Z → A</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label size="xsmall" className="flex items-center">
            Data quality
            <HelpTooltip
              text={{
                title: "Data quality flags",
                body: "Tick any flag to filter to products that are missing that signal. Combine flags to surface products with multiple gaps. Useful right after an importer run to spot products that fell through.",
                bullets: [
                  "Missing image: no thumbnail set at all.",
                  "Broken image: thumbnail IS set but its URL is dead (404/unreachable) — renders a broken icon. Populated by the periodic image scan, not computed live. Click \"Scan images\" to refresh, or combine with a Brand filter to sweep one supplier's range.",
                  "Below cost: a variant's 100+ tier price sits below its supplier cash cost (cost × 1.1) — usually means a spreadsheet fed COST prices in as retail. Populated by the daily pricing audit.",
                ],
              }}
            />
          </Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {QUALITY_FLAGS.map((q) => (
              <label
                key={q.value}
                className="flex cursor-pointer items-center gap-2"
              >
                <Checkbox
                  checked={props.filters.missing.includes(q.value)}
                  onCheckedChange={(c) => {
                    const set = new Set(props.filters.missing)
                    if (c === true) set.add(q.value)
                    else set.delete(q.value)
                    props.setFilter(
                      "missing",
                      [...set] as QualityFlag[]
                    )
                  }}
                />
                <Text size="small">{q.label}</Text>
              </label>
            ))}
          </div>
          <ImageScanControl />
        </div>
      </div>
    </Container>
  )
}

/* ─────────────── bulk action bar ─────────────── */

type BulkActionBarProps = {
  selectedCount: number
  totalMatching: number
  truncated: boolean
  onSelectAllMatching: () => void | Promise<void>
  onClearSelection: () => void
  onPickAction: (action: BulkActionKey) => void
  onDelete: () => void | Promise<void>
  onExport: () => void
  onAiDescriptions: () => void
  disabled: boolean
}

const BulkActionBar = (props: BulkActionBarProps) => {
  const show = props.selectedCount > 0
  const showSelectAll =
    props.totalMatching > 0 && props.selectedCount < props.totalMatching

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Text size="small" weight="plus">
            {show
              ? `${props.selectedCount} selected`
              : "Tick rows below to bulk-edit"}
          </Text>
          {show && showSelectAll ? (
            <Button
              size="small"
              variant="secondary"
              onClick={() => void props.onSelectAllMatching()}
              disabled={props.disabled}
            >
              Select all {Math.min(props.totalMatching, SELECT_ALL_HARD_CAP)}
              {props.totalMatching > SELECT_ALL_HARD_CAP ? "+" : ""} matching
            </Button>
          ) : null}
          {show ? (
            <Button
              size="small"
              variant="transparent"
              onClick={props.onClearSelection}
              disabled={props.disabled}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {show ? (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button size="small" variant="primary" disabled={props.disabled}>
                  Bulk edit ▾
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" className="min-w-[200px]">
                {(Object.keys(ACTION_LABELS) as BulkActionKey[]).map((k) => (
                  <DropdownMenu.Item
                    key={k}
                    onClick={() => props.onPickAction(k)}
                  >
                    {ACTION_LABELS[k]}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onClick={props.onAiDescriptions}>
                  AI descriptions…
                </DropdownMenu.Item>
                <DropdownMenu.Item onClick={props.onExport}>
                  Export CSV
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onClick={() => void props.onDelete()}
                  className="text-ui-tag-red-icon"
                >
                  Delete…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </Container>
  )
}

/* ─────────────── results table ─────────────── */

type ResultsTableProps = {
  products: Product[]
  loading: boolean
  loadError: string | null
  selectedIds: Set<string>
  toggleOne: (id: string, checked: boolean) => void
  toggleAllOnPage: (checked: boolean) => void
  headerChecked: boolean | "indeterminate"
}

const ResultsTable = (props: ResultsTableProps) => {
  if (props.loadError) {
    return (
      <Container className="p-0">
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-tag-red-icon">
            {props.loadError}
          </Text>
        </div>
      </Container>
    )
  }
  return (
    <Container className="overflow-x-auto p-0">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-[44px]">
              <Checkbox
                checked={props.headerChecked}
                onCheckedChange={(c) => props.toggleAllOnPage(c === true)}
                disabled={props.products.length === 0 || props.loading}
              />
            </Table.HeaderCell>
            <Table.HeaderCell>Product</Table.HeaderCell>
            <Table.HeaderCell className="hidden md:table-cell">
              Brand
            </Table.HeaderCell>
            <Table.HeaderCell className="hidden md:table-cell">
              Type
            </Table.HeaderCell>
            <Table.HeaderCell className="hidden lg:table-cell">
              <div className="flex items-center gap-1">
                <span>Print profile</span>
                <HelpTooltip
                  text={{
                    title: "Print profile",
                    body: "Which print rules the storefront customizer applies to this product (printable locations + techniques + sizes). Assign one per product on the product page, or in bulk via 'Set print profile'. '—' means no profile is assigned (the customizer falls back to automatic title/tag inference); 'Custom' means this product has its own per-product locations.",
                  }}
                />
              </div>
            </Table.HeaderCell>
            <Table.HeaderCell className="hidden lg:table-cell">
              Tags
            </Table.HeaderCell>
            <Table.HeaderCell className="hidden lg:table-cell text-right">
              Variants
            </Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell className="hidden lg:table-cell">
              <div className="flex items-center gap-1">
                <span>Data quality</span>
                <HelpTooltip
                  text={{
                    title: "Data quality",
                    body: "A red badge per signal the product is missing — Image, Description, Type, Tags, Brand, Sales channel, or Shop category. An orange 'Broken image' badge means the thumbnail is set but its URL is dead (from the image scan). Green 'Complete' means everything the storefront needs is in place.",
                    bullets: [
                      "Use the 'Missing X' checkboxes in the filter bar to narrow the table to one gap type, then tick rows and bulk-edit to fix.",
                      "Missing Sales channel = invisible to the storefront. Missing Type or Shop category = invisible to the mega-menu.",
                      "Missing Brand on a freshly-imported supplier batch usually means the importer skipped the brand link — fix it once with bulk 'Set brand' rather than re-importing.",
                    ],
                  }}
                />
              </div>
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {props.loading && props.products.length === 0 ? (
            <Table.Row>
              <Table.Cell />
              <Table.Cell>
                <Text size="small" className="text-ui-fg-muted">
                  Loading…
                </Text>
              </Table.Cell>
              <Table.Cell className="hidden md:table-cell" />
              <Table.Cell className="hidden md:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell />
              <Table.Cell className="hidden lg:table-cell" />
            </Table.Row>
          ) : props.products.length === 0 ? (
            <Table.Row>
              <Table.Cell />
              <Table.Cell>
                <Text size="small" className="text-ui-fg-muted">
                  No products match your filter.
                </Text>
              </Table.Cell>
              <Table.Cell className="hidden md:table-cell" />
              <Table.Cell className="hidden md:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell className="hidden lg:table-cell" />
              <Table.Cell />
              <Table.Cell className="hidden lg:table-cell" />
            </Table.Row>
          ) : (
            props.products.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell className="align-middle">
                  <Checkbox
                    checked={props.selectedIds.has(p.id)}
                    onCheckedChange={(c) =>
                      props.toggleOne(p.id, c === true)
                    }
                    disabled={props.loading}
                  />
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-3">
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt=""
                        className="size-10 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="size-10 shrink-0 rounded-md bg-ui-bg-subtle" />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <a
                        href={`/app/products/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-ui-fg-base hover:underline truncate"
                      >
                        {p.title ?? "(no title)"}
                      </a>
                      <span className="font-mono text-xs text-ui-fg-muted truncate">
                        {p.handle ?? "—"}
                      </span>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Text size="small">{p.brand?.name ?? "—"}</Text>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Text size="small">{p.type?.value ?? "—"}</Text>
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  {p.print_profile === "custom" ? (
                    <Badge size="2xsmall" color="orange">
                      Custom
                    </Badge>
                  ) : p.print_profile ? (
                    <Text size="small">{humanizeProfileHandle(p.print_profile)}</Text>
                  ) : (
                    <Text size="small" className="text-ui-fg-muted">
                      —
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 3).map((t) => (
                      <Badge
                        key={t.id}
                        size="2xsmall"
                        color="grey"
                      >
                        {t.value}
                      </Badge>
                    ))}
                    {p.tags.length > 3 ? (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        +{p.tags.length - 3}
                      </Text>
                    ) : null}
                  </div>
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell text-right">
                  <Text size="small">{p.variant_count}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    size="2xsmall"
                    color={
                      p.status === "published"
                        ? "green"
                        : p.status === "draft"
                          ? "orange"
                          : "grey"
                    }
                  >
                    {p.status ?? "—"}
                  </Badge>
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  <QualityCell quality={p.quality} />
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
    </Container>
  )
}

/* ─────────────── quality dots ─────────────── */

/**
 * Per-row "data quality" cell.
 *
 * Earlier version showed 7 unlabelled dots in fixed order, which was
 * cryptic — staff had to mentally count positions and look up a legend
 * to know what was missing. This version shows the data instead of
 * encoding it: a single green "Complete" badge when nothing's missing,
 * or one red badge per missing signal (named in plain English). Lets
 * staff scan the column at a glance.
 */
const QualityCell = ({ quality }: { quality: Quality }) => {
  const missing: Array<{ key: string; label: string }> = []
  for (const k of QUALITY_KEYS) {
    if (!quality[k]) {
      missing.push({ key: k, label: QUALITY_LABELS[k] })
    }
  }
  const broken = !!quality.broken_image
  const belowCost = !!quality.below_cost
  if (missing.length === 0 && !broken && !belowCost) {
    return (
      <Badge size="2xsmall" color="green">
        Complete
      </Badge>
    )
  }
  const titleParts = [
    ...(belowCost
      ? ["Below cost (a variant's 100+ tier prices under its supplier cash cost — check the ladder)"]
      : []),
    ...(broken ? ["Broken image (thumbnail URL doesn't load)"] : []),
    ...(missing.length ? [`Missing: ${missing.map((m) => m.label).join(", ")}`] : []),
  ]
  return (
    <div className="flex flex-wrap gap-1" title={titleParts.join(" · ")}>
      {belowCost ? (
        <Badge size="2xsmall" color="red">
          Below cost
        </Badge>
      ) : null}
      {broken ? (
        <Badge size="2xsmall" color="orange">
          Broken image
        </Badge>
      ) : null}
      {missing.map((m) => (
        <Badge key={m.key} size="2xsmall" color="red">
          {m.label}
        </Badge>
      ))}
    </div>
  )
}

/* ─────────────── pagination bar ─────────────── */

type PaginationBarProps = {
  offset: number
  pageSize: number
  totalCount: number
  visibleStart: number
  visibleEnd: number
  pageIndex: number
  pageCount: number
  loading: boolean
  truncated: boolean
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onPageSize: (size: (typeof PAGE_SIZES)[number]) => void
}

const PaginationBar = (props: PaginationBarProps) => {
  return (
    <Container className="p-0">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Text size="small" className="text-ui-fg-muted">
            Showing {props.visibleStart}-{props.visibleEnd} of{" "}
            {props.totalCount}
            {props.loading ? " (loading)" : ""}
            {props.truncated ? " (capped at 2000)" : ""}
          </Text>
          <div className="flex items-center gap-2">
            <Text size="xsmall" className="text-ui-fg-muted">
              Per page
            </Text>
            <Select
              value={`${props.pageSize}`}
              size="small"
              onValueChange={(v) =>
                props.onPageSize(
                  Number(v) as (typeof PAGE_SIZES)[number]
                )
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {PAGE_SIZES.map((sz) => (
                  <Select.Item key={sz} value={`${sz}`}>
                    {sz}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Text size="small" className="text-ui-fg-muted">
            Page {props.pageIndex + 1} of {props.pageCount}
          </Text>
          <Button
            variant="secondary"
            size="small"
            disabled={!props.canPrev}
            onClick={props.onPrev}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={!props.canNext}
            onClick={props.onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </Container>
  )
}

/* ─────────────── action config modal ─────────────── */

type ActionConfigModalProps = {
  actionKey: BulkActionKey
  selectedCount: number
  selectedProducts: Product[]
  onClose: () => void
  onConfirm: (payload: Record<string, unknown>) => void | Promise<void>
  brandOptions: MultiSelectOption[]
  typeOptions: MultiSelectOption[]
  tagOptions: MultiSelectOption[]
  categoryOptions: MultiSelectOption[]
  collectionOptions: MultiSelectOption[]
  salesChannelOptions: MultiSelectOption[]
  printProfileOptions: MultiSelectOption[]
}

const ActionConfigModal = (props: ActionConfigModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const submit = async (payload: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await props.onConfirm(payload)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <FocusModal open onOpenChange={(o) => !o && props.onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>{ACTION_LABELS[props.actionKey]}</FocusModal.Title>
          <Text size="small" className="text-ui-fg-muted">
            {props.selectedCount} product{props.selectedCount === 1 ? "" : "s"}{" "}
            selected
          </Text>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col gap-4 p-6">
          {renderActionBody(props.actionKey, props, submit, submitting)}
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

function renderActionBody(
  key: BulkActionKey,
  props: ActionConfigModalProps,
  submit: (payload: Record<string, unknown>) => Promise<void>,
  submitting: boolean
) {
  switch (key) {
    case "change_status":
      return (
        <ChangeStatusForm
          submit={submit}
          submitting={submitting}
          onCancel={props.onClose}
          selectedProducts={props.selectedProducts}
        />
      )
    case "set_brand":
      return (
        <SingleSetForm
          label="New brand"
          options={props.brandOptions}
          submit={(value) => submit({ brand_id: value })}
          submitting={submitting}
          allowNone
          onCancel={props.onClose}
          diffDescription={renderBrandDiff(props.selectedProducts)}
        />
      )
    case "set_type":
      return (
        <SingleSetForm
          label="New type"
          options={props.typeOptions}
          submit={(value) => submit({ type_id: value })}
          submitting={submitting}
          allowNone
          onCancel={props.onClose}
        />
      )
    case "set_collection":
      return (
        <SingleSetForm
          label="New collection"
          options={props.collectionOptions}
          submit={(value) => submit({ collection_id: value })}
          submitting={submitting}
          allowNone
          onCancel={props.onClose}
        />
      )
    case "set_print_profile":
      return (
        <SingleSetForm
          label="Print profile"
          options={props.printProfileOptions}
          submit={(value) =>
            value ? submit({ profile_handle: value }) : Promise.resolve()
          }
          submitting={submitting}
          onCancel={props.onClose}
        />
      )
    case "set_tags":
      return (
        <MultiSetForm
          label="Tags"
          options={props.tagOptions}
          submit={(ids, mode) => submit({ tag_ids: ids, mode })}
          submitting={submitting}
          onCancel={props.onClose}
        />
      )
    case "set_sales_channels":
      return (
        <MultiSetForm
          label="Sales channels"
          options={props.salesChannelOptions}
          submit={(ids, mode) =>
            submit({ sales_channel_ids: ids, mode })
          }
          submitting={submitting}
          onCancel={props.onClose}
        />
      )
    case "set_categories":
      return (
        <MultiSetForm
          label="Shop categories"
          options={props.categoryOptions}
          submit={(ids, mode) =>
            submit({ category_ids: ids, mode })
          }
          submitting={submitting}
          onCancel={props.onClose}
        />
      )
  }
}

function renderBrandDiff(selected: Product[]) {
  const counts = new Map<string, number>()
  let none = 0
  for (const p of selected) {
    if (!p.brand) none++
    else counts.set(p.brand.name ?? p.brand.id, (counts.get(p.brand.name ?? p.brand.id) ?? 0) + 1)
  }
  const parts: string[] = []
  if (none > 0) parts.push(`${none} no brand`)
  for (const [name, n] of counts) parts.push(`${n} × ${name}`)
  if (parts.length === 0) return null
  return `Current: ${parts.join(", ")}`
}

const ChangeStatusForm = ({
  submit,
  submitting,
  onCancel,
  selectedProducts,
}: {
  submit: (payload: Record<string, unknown>) => void | Promise<void>
  submitting: boolean
  onCancel: () => void
  selectedProducts: Product[]
}) => {
  const [status, setStatus] = useState<ProductStatus>("published")
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of selectedProducts) {
      const k = p.status ?? "(none)"
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()]
  }, [selectedProducts])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label size="small">Set status to</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ProductStatus)}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {STATUS_OPTIONS.map((s) => (
              <Select.Item key={s.value} value={s.value}>
                {s.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      {counts.length > 0 ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Current: {counts.map(([k, n]) => `${n} × ${k}`).join(", ")}
        </Text>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void submit({ status })}
          isLoading={submitting}
        >
          Apply
        </Button>
      </div>
    </div>
  )
}

const SingleSetForm = ({
  label,
  options,
  submit,
  submitting,
  allowNone,
  onCancel,
  diffDescription,
}: {
  label: string
  options: MultiSelectOption[]
  submit: (value: string | null) => void | Promise<void>
  submitting: boolean
  allowNone?: boolean
  onCancel: () => void
  diffDescription?: string | null
}) => {
  const [value, setValue] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label size="small">{label}</Label>
        <Select
          value={value ?? "__none__"}
          onValueChange={(v) => setValue(v === "__none__" ? null : v)}
        >
          <Select.Trigger>
            <Select.Value placeholder="Pick…" />
          </Select.Trigger>
          <Select.Content>
            {allowNone ? (
              <Select.Item value="__none__">— Clear —</Select.Item>
            ) : null}
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      {diffDescription ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {diffDescription}
        </Text>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void submit(value)}
          isLoading={submitting}
        >
          Apply
        </Button>
      </div>
    </div>
  )
}

const MultiSetForm = ({
  label,
  options,
  submit,
  submitting,
  onCancel,
}: {
  label: string
  options: MultiSelectOption[]
  submit: (ids: string[], mode: "add" | "remove" | "replace") => void | Promise<void>
  submitting: boolean
  onCancel: () => void
}) => {
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<"add" | "remove" | "replace">("add")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label size="small">Mode</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as any)}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="add">Add (union with existing)</Select.Item>
            <Select.Item value="remove">Remove (subtract from existing)</Select.Item>
            <Select.Item value="replace">Replace (overwrite existing)</Select.Item>
          </Select.Content>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label size="small">{label}</Label>
        <MultiSelectPicker
          options={options}
          selected={selected}
          onChange={setSelected}
          placeholder={`Pick ${label.toLowerCase()}…`}
          contentClassName="w-[360px]"
        />
        <Text size="xsmall" className="text-ui-fg-muted">
          {selected.length} selected.
          {mode === "replace" && selected.length === 0
            ? " Replace with empty = clear all."
            : ""}
        </Text>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void submit(selected, mode)}
          isLoading={submitting}
          disabled={selected.length === 0 && mode !== "replace"}
        >
          Apply
        </Button>
      </div>
    </div>
  )
}

/* ─────────────── result modal ─────────────── */

type ResultModalProps = {
  result: BulkResult
  onClose: () => void
  /** Re-run the last bulk action on just the failures. Absent = no retry. */
  onRetry?: () => Promise<void>
}

const ResultModal = (props: ResultModalProps) => {
  const { succeeded, failed, total } = props.result
  const [retrying, setRetrying] = useState(false)
  const handleRetry = async () => {
    if (!props.onRetry || retrying) return
    setRetrying(true)
    try {
      await props.onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <FocusModal open onOpenChange={(o) => !o && props.onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>Bulk action complete</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col gap-4 p-6">
          <Text>
            {succeeded.length} of {total} succeeded.
            {failed.length > 0 ? ` ${failed.length} failed.` : ""}
          </Text>
          {failed.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label size="small">Failures</Label>
              <pre className="max-h-72 overflow-auto rounded-md bg-ui-bg-subtle p-3 font-mono text-xs">
                {failed
                  .map((f) => `${f.id}: ${f.error}`)
                  .join("\n")}
              </pre>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            {props.onRetry && failed.length > 0 ? (
              <Button
                variant="secondary"
                isLoading={retrying}
                disabled={retrying}
                onClick={handleRetry}
              >
                Retry {failed.length} failed
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={props.onClose}
              disabled={retrying}
            >
              Close
            </Button>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

/* ─────────────── AI descriptions modal ─────────────── */

const AI_DESC_CHUNK = 6

type DescriptionLength = "short" | "standard" | "detailed"

const LENGTH_OPTIONS: { value: DescriptionLength; label: string; hint: string }[] = [
  { value: "short", label: "Short", hint: "One line (~140 chars)" },
  { value: "standard", label: "Standard", hint: "~2 sentences" },
  { value: "detailed", label: "Detailed", hint: "~3 short paragraphs" },
]

type AiDescriptionModalProps = {
  selectedIds: string[]
  loadedProducts: Product[]
  onClose: () => void
  /** cleanRun === true when every product wrote with no failures and no cancel. */
  onComplete: (cleanRun: boolean) => void
}

/**
 * Bulk AI description generator. One paid LLM call per product, so it
 * chunks the selection and POSTs each chunk to
 * `/admin/products-manager/ai-descriptions`, showing live progress. The
 * tab must stay open for the run to finish — this is a foreground tool,
 * not a background job.
 */
const AiDescriptionModal = (props: AiDescriptionModalProps) => {
  // Snapshot the selection at mount — the parent clears it on a clean run,
  // which would otherwise reset the progress UI mid-display.
  const [ids] = useState(props.selectedIds)
  const total = ids.length
  const [length, setLength] = useState<DescriptionLength>("standard")
  const [overwrite, setOverwrite] = useState(false)
  const [phase, setPhase] = useState<"config" | "running" | "done">("config")
  const [done, setDone] = useState(0)
  const [wrote, setWrote] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [failures, setFailures] = useState<Array<{ id: string; error: string }>>([])
  const [fatalError, setFatalError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  // Approximate (current page only) — how many selected rows already have copy.
  const loadedSelectedWithDesc = useMemo(() => {
    const sel = new Set(ids)
    return props.loadedProducts.filter(
      (p) => sel.has(p.id) && p.quality.has_description
    ).length
  }, [ids, props.loadedProducts])

  const run = async () => {
    cancelRef.current = false
    setPhase("running")
    setDone(0)
    setWrote(0)
    setSkipped(0)
    setFailures([])
    setFatalError(null)

    let okCount = 0
    let skipCount = 0
    let fatal: string | null = null
    const fails: Array<{ id: string; error: string }> = []

    for (let i = 0; i < ids.length; i += AI_DESC_CHUNK) {
      if (cancelRef.current) break
      const chunk = ids.slice(i, i + AI_DESC_CHUNK)
      try {
        const res = await fetch("/admin/products-manager/ai-descriptions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ product_ids: chunk, length, overwrite }),
        })
        if (res.status === 503) {
          const j = await res.json().catch(() => ({}))
          fatal =
            j?.detail ||
            "AI provider not configured. Set AI_PROVIDER + the matching API key on the backend."
          break
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          for (const id of chunk)
            fails.push({ id, error: `HTTP ${res.status}: ${text.slice(0, 120)}` })
        } else {
          const data = (await res.json()) as {
            succeeded: string[]
            failed: Array<{ id: string; error: string }>
            skipped: string[]
          }
          okCount += data.succeeded.length
          skipCount += data.skipped.length
          fails.push(...data.failed)
        }
      } catch (err: any) {
        for (const id of chunk)
          fails.push({ id, error: err?.message ?? "Network error" })
      }
      setDone(Math.min(i + chunk.length, ids.length))
      setWrote(okCount)
      setSkipped(skipCount)
      setFailures([...fails])
    }

    setFatalError(fatal)
    setPhase("done")

    const cleanRun = !fatal && fails.length === 0 && !cancelRef.current
    if (fatal) {
      toast.error(fatal)
    } else if (fails.length === 0) {
      toast.success(
        `AI descriptions: wrote ${okCount}${skipCount ? `, skipped ${skipCount}` : ""}.`
      )
    } else {
      toast.warning(
        `AI descriptions: wrote ${okCount}, failed ${fails.length}${skipCount ? `, skipped ${skipCount}` : ""}.`
      )
    }
    props.onComplete(cleanRun)
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const running = phase === "running"

  return (
    <FocusModal
      open
      onOpenChange={(o) => {
        // Block closing mid-run so a chunk loop isn't orphaned.
        if (!o && !running) props.onClose()
      }}
    >
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>AI descriptions</FocusModal.Title>
          <Text size="small" className="text-ui-fg-muted">
            {total} product{total === 1 ? "" : "s"} selected
          </Text>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col gap-4 p-6">
          {phase === "config" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label size="small">Length</Label>
                <Select
                  value={length}
                  onValueChange={(v) => setLength(v as DescriptionLength)}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {LENGTH_OPTIONS.map((o) => (
                      <Select.Item key={o.value} value={o.value}>
                        {o.label} — {o.hint}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-ui-border-base p-3">
                <Checkbox
                  checked={overwrite}
                  onCheckedChange={(v) => setOverwrite(Boolean(v))}
                />
                <div className="flex flex-col gap-1">
                  <Text size="small" weight="plus">
                    Overwrite existing descriptions
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Off (default): products that already have a description are
                    skipped — only blanks get written. On: every selected
                    product is regenerated and replaced. There's no per-field
                    undo.
                  </Text>
                </div>
              </label>

              {!overwrite && loadedSelectedWithDesc > 0 ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  At least {loadedSelectedWithDesc} of the selected rows on this
                  page already have a description and will be skipped.
                </Text>
              ) : null}

              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Generates one description per product via the configured AI
                  provider and applies it directly (status is left untouched).
                  Runs in batches of {AI_DESC_CHUNK} — keep this tab open until
                  it finishes. Roughly a few seconds per product.
                </Text>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={props.onClose}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void run()}>
                  Generate {total} description{total === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Text size="small" weight="plus">
                    {running ? "Generating…" : "Done"}
                  </Text>
                  <Text size="small" className="text-ui-fg-muted">
                    {done} / {total}
                  </Text>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                  <div
                    className="h-full rounded-full bg-ui-fg-interactive transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge color="green">{wrote} written</Badge>
                  {skipped > 0 ? <Badge color="grey">{skipped} skipped</Badge> : null}
                  {failures.length > 0 ? (
                    <Badge color="red">{failures.length} failed</Badge>
                  ) : null}
                </div>
              </div>

              {fatalError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
                  <Text size="small" className="text-rose-800">
                    {fatalError}
                  </Text>
                </div>
              ) : null}

              {failures.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label size="small">Failures</Label>
                  <pre className="max-h-56 overflow-auto rounded-md bg-ui-bg-subtle p-3 font-mono text-xs">
                    {failures.map((f) => `${f.id}: ${f.error}`).join("\n")}
                  </pre>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                {running ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      cancelRef.current = true
                    }}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button variant="primary" onClick={props.onClose}>
                    Close
                  </Button>
                )}
              </div>
            </>
          )}
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

export default ProductsManagerTab

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Switch,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"

/**
 * Shop categories — health & management.
 *
 * The mega-menu's drill-down is driven by the audience × garment-type tree
 * in [backend/src/lib/shop-categories.ts]. This page is the single source
 * of truth for:
 *
 *   1. **Health view**: per-category product counts, colour-coded. Surfaces
 *      which menu links currently go to empty pages so staff can prioritise.
 *   2. **Management drawer**: click any sub row → drawer opens with the
 *      product list inside that category. Staff can rename, hide from menu,
 *      remove misclassified products, and manually pin products via search.
 *
 * Backend routes:
 *   GET    /admin/shop-categories/health
 *   GET    /admin/shop-categories/:handle
 *   POST   /admin/shop-categories/:handle           (rename / hide toggle)
 *   GET    /admin/shop-categories/:handle/products  (paginated drill-down)
 *   POST   /admin/shop-categories/:handle/products  (bulk assign)
 *   DELETE /admin/shop-categories/:handle/products/:product_id
 */

// ============================================================
// TYPES
// ============================================================

type SampleEntry = {
  id: string
  title: string
  handle: string
}

type CategoryNode = {
  handle: string
  sub_handle: string
  name: string
  product_count: number
  sample: SampleEntry[]
}

type AudienceNode = {
  handle: string
  name: string
  product_count: number
  subs: CategoryNode[]
}

type HealthResponse = {
  audiences: AudienceNode[]
  summary: {
    total_published_products: number
    products_without_shop_category: number
    orphan_sample: SampleEntry[]
    total_categories: number
    populated_categories: number
    empty_categories: number
    capped: boolean
    total_count_in_db: number | null
  }
}

type DrawerProduct = {
  id: string
  title: string | null
  handle: string | null
  status: string | null
  thumbnail: string | null
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
  brand:
    | Array<{ handle: string; name: string }>
    | { handle: string; name: string }
    | null
}

type CategoryDetail = {
  id: string
  name: string
  handle: string
  is_active: boolean
  is_hidden_from_menu: boolean
  metadata: Record<string, unknown>
  product_count: number | null
}

// ============================================================
// MAIN PAGE
// ============================================================

const ShopCategoriesPage = () => {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hideEmpty, setHideEmpty] = useState(false)
  const [hidePopulated, setHidePopulated] = useState(false)
  const [openCategory, setOpenCategory] = useState<{
    handle: string
    name: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/shop-categories/health", {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`Health endpoint returned HTTP ${res.status}`)
      const json = (await res.json()) as HealthResponse
      setData(json)
    } catch (err: any) {
      const msg = err?.message ?? "Failed to load category health"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleAudience = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Expand audiences with at least one empty sub by default — that's
  // where the staff member's attention should go first.
  useEffect(() => {
    if (!data) return
    const auto = new Set<string>()
    for (const audience of data.audiences) {
      if (audience.subs.some((s) => s.product_count === 0)) {
        auto.add(audience.handle)
      }
    }
    setExpanded(auto)
  }, [data])

  const filteredAudiences = useMemo(() => {
    if (!data) return []
    return data.audiences
      .map((audience) => {
        const subs = audience.subs.filter((sub) => {
          if (hideEmpty && sub.product_count === 0) return false
          if (hidePopulated && sub.product_count > 0) return false
          return true
        })
        return { ...audience, subs }
      })
      .filter((audience) => audience.subs.length > 0)
  }, [data, hideEmpty, hidePopulated])

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-2">
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex-1">
            <Heading level="h1" className="flex items-center">
              Shop categories
              <HelpTooltip
                text={{
                  title: "Shop categories",
                  body: "Health view of every node in the Shop tree (audience × garment-type). Each row shows the published-product count for that category — the live data behind the mega-menu drill-down. Click a row to manage its products.",
                  bullets: [
                    "Empty categories (red) are dead links in the mega-menu — fix the data before redesigning the menu.",
                    "Low-count categories (orange, 1-5 products) may be misclassifications — open the drawer and spot-check.",
                    "Click Manage on any row to add or remove products manually, rename the category, or hide it from the menu without breaking deep links.",
                    "Orphan products (no Shop category at all) live at the bottom of this page — those are invisible to the menu entirely.",
                    "Bulk fix: run backfill-product-taxonomy.ts. Then refresh.",
                  ],
                }}
              />
            </Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              Live product counts per category. Click any row to open the
              management drawer.
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </Container>

      {error ? (
        <Container>
          <div className="rounded-md border border-ui-border-error bg-ui-tag-red-bg p-4">
            <Text size="small" className="text-ui-tag-red-text">
              {error}
            </Text>
          </div>
        </Container>
      ) : null}

      {/* Summary tiles */}
      <Container>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile
            label="Categories total"
            value={data?.summary.total_categories ?? null}
            loading={loading}
          />
          <SummaryTile
            label="Populated"
            value={data?.summary.populated_categories ?? null}
            tone="green"
            loading={loading}
          />
          <SummaryTile
            label="Empty (dead links)"
            value={data?.summary.empty_categories ?? null}
            tone={
              (data?.summary.empty_categories ?? 0) > 0 ? "red" : "green"
            }
            loading={loading}
          />
          <SummaryTile
            label="Orphan products"
            tooltip="Published products that aren't in any Shop category. Invisible to the mega-menu."
            value={data?.summary.products_without_shop_category ?? null}
            tone={
              (data?.summary.products_without_shop_category ?? 0) > 0
                ? "orange"
                : "green"
            }
            loading={loading}
          />
        </div>
      </Container>

      {/* Filter toggles */}
      <Container>
        <div className="flex items-center gap-x-3 flex-wrap">
          <Text size="xsmall" className="text-ui-fg-muted">
            Filter:
          </Text>
          <button
            type="button"
            onClick={() => setHideEmpty((v) => !v)}
            className={[
              "text-xs px-3 py-1 rounded-full border transition-colors",
              hideEmpty
                ? "border-ui-border-strong bg-ui-bg-subtle text-ui-fg-base"
                : "border-ui-border-base bg-transparent text-ui-fg-muted hover:bg-ui-bg-subtle",
            ].join(" ")}
          >
            {hideEmpty ? "✓ Hiding empty" : "Hide empty"}
          </button>
          <button
            type="button"
            onClick={() => setHidePopulated((v) => !v)}
            className={[
              "text-xs px-3 py-1 rounded-full border transition-colors",
              hidePopulated
                ? "border-ui-border-strong bg-ui-bg-subtle text-ui-fg-base"
                : "border-ui-border-base bg-transparent text-ui-fg-muted hover:bg-ui-bg-subtle",
            ].join(" ")}
          >
            {hidePopulated ? "✓ Hiding populated" : "Show only empty"}
          </button>
        </div>
      </Container>

      {/* Per-audience accordion */}
      <Container className="flex flex-col gap-y-3">
        {loading && !data ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading category health…
          </Text>
        ) : null}

        {filteredAudiences.map((audience) => {
          const isOpen = expanded.has(audience.handle)
          const emptyCount = audience.subs.filter(
            (s) => s.product_count === 0
          ).length
          return (
            <div
              key={audience.handle}
              className="rounded-md border border-ui-border-base bg-ui-bg-base overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleAudience(audience.handle)}
                className="w-full px-4 py-3 flex items-center justify-between gap-x-3 hover:bg-ui-bg-subtle transition-colors"
              >
                <div className="flex items-center gap-x-3">
                  <Text className="text-ui-fg-muted text-xs w-4 text-center">
                    {isOpen ? "▾" : "▸"}
                  </Text>
                  <Heading level="h3" className="text-sm">
                    {audience.name}
                  </Heading>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {audience.subs.length} categor
                    {audience.subs.length === 1 ? "y" : "ies"} ·{" "}
                    {audience.product_count} product placement
                    {audience.product_count === 1 ? "" : "s"}
                  </Text>
                </div>
                {emptyCount > 0 ? (
                  <Badge color="red">{emptyCount} empty</Badge>
                ) : (
                  <Badge color="green">All populated</Badge>
                )}
              </button>

              {isOpen ? (
                <div className="border-t border-ui-border-base divide-y divide-ui-border-base">
                  {audience.subs.map((sub) => (
                    <CategoryRow
                      key={sub.handle}
                      sub={sub}
                      onManage={() =>
                        setOpenCategory({
                          handle: sub.handle,
                          name: sub.name,
                        })
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}

        {!loading && filteredAudiences.length === 0 ? (
          <Text size="small" className="text-ui-fg-muted">
            No categories match the current filter.
          </Text>
        ) : null}
      </Container>

      {/* Orphan products tile */}
      {data && data.summary.products_without_shop_category > 0 ? (
        <Container>
          <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4 flex flex-col gap-y-2">
            <div className="flex items-center justify-between gap-x-3">
              <Heading level="h3" className="text-sm">
                Orphan products — no Shop category
              </Heading>
              <Badge color="orange">
                {data.summary.products_without_shop_category}
              </Badge>
            </div>
            <Text size="xsmall" className="text-ui-fg-muted">
              These published products aren&apos;t in any node of the Shop tree
              and are therefore invisible to the mega-menu. Fix by running
              the backfill or assigning categories on the product detail page.
            </Text>
            {data.summary.orphan_sample.length > 0 ? (
              <ul className="flex flex-col gap-y-1 mt-2">
                {data.summary.orphan_sample.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/app/products/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive hover:underline text-xs"
                    >
                      {p.title}
                    </a>
                  </li>
                ))}
                {data.summary.orphan_sample.length > 10 ? (
                  <li>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      …and {data.summary.products_without_shop_category - 10}{" "}
                      more (showing first 10 of sample).
                    </Text>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </Container>
      ) : null}

      {/* How-to-fix instruction box */}
      <Container>
        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4 flex flex-col gap-y-2">
          <Heading level="h3" className="text-sm">
            Bulk fix
          </Heading>
          <Text size="xsmall" className="text-ui-fg-muted">
            The backfill script in the backend repo re-runs the title-based
            classifier + Shop-category assignment for every product. Safe to
            re-run; preserves manual edits.
          </Text>
          <div className="bg-ui-bg-base rounded p-3 font-mono text-xs">
            <div className="text-ui-fg-muted"># preview the diff first:</div>
            <div>DRY_RUN=1 npx medusa exec src/scripts/backfill-product-taxonomy.ts</div>
            <div className="text-ui-fg-muted mt-2"># then run for real:</div>
            <div>npx medusa exec src/scripts/backfill-product-taxonomy.ts</div>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">
            After running, hit <strong>Refresh</strong> above to see the new
            counts. Categories that stay empty after backfill are gaps in{" "}
            <code className="bg-ui-bg-base px-1 rounded">
              PRODUCT_TYPE_ALIASES
            </code>{" "}
            /{" "}
            <code className="bg-ui-bg-base px-1 rounded">TAG_ALIASES</code> in{" "}
            <code className="bg-ui-bg-base px-1 rounded">
              backend/src/lib/product-taxonomy.ts
            </code>{" "}
            — either extend the alias map or use the drawer to assign /
            remove products manually.
          </Text>
        </div>
      </Container>

      {data?.summary.capped ? (
        <Container>
          <div className="rounded-md border border-ui-border-warning bg-ui-tag-orange-bg p-3">
            <Text size="xsmall" className="text-ui-tag-orange-text">
              ⚠ Walked the first 10,000 products — your catalog is larger
              ({data.summary.total_count_in_db?.toLocaleString() ?? "—"} in
              DB). Counts may understate populated categories. Raise{" "}
              <code>MAX_PRODUCTS</code> in the route if this becomes a real
              problem.
            </Text>
          </div>
        </Container>
      ) : null}

      <CategoryManageDrawer
        open={!!openCategory}
        handle={openCategory?.handle ?? null}
        name={openCategory?.name ?? null}
        onClose={() => setOpenCategory(null)}
        onMutated={() => void load()}
      />
    </div>
  )
}

// ============================================================
// CATEGORY ROW (drives the drawer)
// ============================================================

type CountBadgeTone = "red" | "orange" | "green"

const toneForCount = (count: number): CountBadgeTone => {
  if (count === 0) return "red"
  if (count <= 5) return "orange"
  return "green"
}

const CategoryRow = ({
  sub,
  onManage,
}: {
  sub: CategoryNode
  onManage: () => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const badgeColor = toneForCount(sub.product_count)

  return (
    <div className="px-4 py-3 flex flex-col gap-y-2">
      <div className="flex items-center justify-between gap-x-3">
        <div className="flex items-center gap-x-3 min-w-0">
          <Text className="text-sm font-medium truncate">{sub.name}</Text>
          <code className="text-xs text-ui-fg-muted bg-ui-bg-subtle px-1.5 py-0.5 rounded">
            {sub.handle}
          </code>
        </div>
        <div className="flex items-center gap-x-2 flex-shrink-0">
          <Badge color={badgeColor}>
            {sub.product_count} product{sub.product_count === 1 ? "" : "s"}
          </Badge>
          <Button size="small" variant="secondary" onClick={onManage}>
            Manage
          </Button>
          {sub.product_count > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-ui-fg-muted hover:text-ui-fg-base"
            >
              {expanded ? "Hide sample" : "Sample"}
            </button>
          ) : null}
        </div>
      </div>
      {expanded && sub.sample.length > 0 ? (
        <ul className="flex flex-col gap-y-1 ml-1">
          {sub.sample.map((p) => (
            <li key={p.id}>
              <a
                href={`/app/products/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ui-fg-interactive hover:underline"
              >
                {p.title}
              </a>
            </li>
          ))}
          {sub.product_count > sub.sample.length ? (
            <li>
              <Text size="xsmall" className="text-ui-fg-muted">
                …and {sub.product_count - sub.sample.length} more — open
                Manage to see all.
              </Text>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

// ============================================================
// MANAGEMENT DRAWER
// ============================================================

const PAGE_SIZE = 25

const CategoryManageDrawer = ({
  open,
  handle,
  name,
  onClose,
  onMutated,
}: {
  open: boolean
  handle: string | null
  name: string | null
  onClose: () => void
  /** Called after any successful mutation so the parent can reload health. */
  onMutated: () => void
}) => {
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <Drawer.Content className="max-w-2xl">
        <Drawer.Header>
          <Drawer.Title>
            Manage: {name ?? "—"}
            {handle ? (
              <code className="ml-2 text-xs text-ui-fg-muted bg-ui-bg-subtle px-1.5 py-0.5 rounded font-normal">
                {handle}
              </code>
            ) : null}
          </Drawer.Title>
          <Drawer.Description>
            Products in this category, plus rename / hide controls.
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="overflow-auto">
          {handle ? (
            <DrawerBody
              handle={handle}
              fallbackName={name ?? ""}
              onMutated={onMutated}
            />
          ) : null}
        </Drawer.Body>
        <Drawer.Footer>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const DrawerBody = ({
  handle,
  fallbackName,
  onMutated,
}: {
  handle: string
  fallbackName: string
  onMutated: () => void
}) => {
  const [detail, setDetail] = useState<CategoryDetail | null>(null)
  const [products, setProducts] = useState<DrawerProduct[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/admin/shop-categories/${handle}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`Detail returned HTTP ${res.status}`)
      const json = (await res.json()) as { category: CategoryDetail }
      setDetail(json.category)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load category")
    }
  }, [handle])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (search.trim()) params.set("q", search.trim())
      const res = await fetch(
        `/admin/shop-categories/${handle}/products?${params.toString()}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      )
      if (!res.ok) throw new Error(`Products returned HTTP ${res.status}`)
      const json = (await res.json()) as {
        products: DrawerProduct[]
        pagination: { total: number | null }
      }
      setProducts(json.products)
      setTotal(json.pagination.total)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load products")
    } finally {
      setLoading(false)
    }
  }, [handle, offset, search])

  // Initial load + reload when handle changes.
  useEffect(() => {
    setOffset(0)
    setSearch("")
    void loadDetail()
  }, [handle, loadDetail])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const handleRemove = async (productId: string) => {
    try {
      const res = await fetch(
        `/admin/shop-categories/${handle}/products/${productId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )
      if (!res.ok) throw new Error(`Remove returned HTTP ${res.status}`)
      toast.success("Removed from category")
      // Optimistically drop from the list; parent will refresh counts.
      setProducts((prev) => prev.filter((p) => p.id !== productId))
      setTotal((t) => (typeof t === "number" ? Math.max(0, t - 1) : t))
      onMutated()
    } catch (err: any) {
      toast.error(err?.message ?? "Remove failed")
    }
  }

  const handleAddProducts = async (productIds: string[]) => {
    if (productIds.length === 0) return
    try {
      const res = await fetch(`/admin/shop-categories/${handle}/products`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ product_ids: productIds }),
      })
      if (!res.ok) throw new Error(`Add returned HTTP ${res.status}`)
      const json = (await res.json()) as {
        added: number
        already_assigned: number
        failures: number
      }
      const parts: string[] = []
      if (json.added > 0) parts.push(`${json.added} added`)
      if (json.already_assigned > 0)
        parts.push(`${json.already_assigned} already in category`)
      if (json.failures > 0) parts.push(`${json.failures} failed`)
      toast.success(parts.join(", ") || "Nothing changed")
      onMutated()
      void loadProducts()
    } catch (err: any) {
      toast.error(err?.message ?? "Add failed")
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      {error ? (
        <div className="rounded-md border border-ui-border-error bg-ui-tag-red-bg p-3">
          <Text size="small" className="text-ui-tag-red-text">
            {error}
          </Text>
        </div>
      ) : null}

      <Tabs defaultValue="products">
        <Tabs.List>
          <Tabs.Trigger value="products">
            Products
            {typeof total === "number" ? (
              <span className="ml-2 text-ui-fg-muted">({total})</span>
            ) : null}
          </Tabs.Trigger>
          <Tabs.Trigger value="add">Add product</Tabs.Trigger>
          <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
        </Tabs.List>

        {/* PRODUCTS TAB */}
        <Tabs.Content
          value="products"
          className="flex flex-col gap-y-3 pt-3"
        >
          <Input
            type="search"
            placeholder="Filter by title…"
            value={search}
            onChange={(e) => {
              setOffset(0)
              setSearch(e.currentTarget.value)
            }}
          />
          {loading ? (
            <Text size="small" className="text-ui-fg-muted">
              Loading…
            </Text>
          ) : products.length === 0 ? (
            <Text size="small" className="text-ui-fg-muted">
              No products in this category
              {search ? ` matching "${search}"` : ""}.
            </Text>
          ) : (
            <ul className="flex flex-col gap-y-2">
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  onRemove={() => handleRemove(p.id)}
                />
              ))}
            </ul>
          )}

          {typeof total === "number" && total > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-x-3 pt-2">
              <Text size="xsmall" className="text-ui-fg-muted">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
                {total}
              </Text>
              <div className="flex items-center gap-x-2">
                <Button
                  size="small"
                  variant="secondary"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={offset + PAGE_SIZE >= total || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Tabs.Content>

        {/* ADD PRODUCT TAB */}
        <Tabs.Content
          value="add"
          className="flex flex-col gap-y-3 pt-3"
        >
          <ProductSearchPicker
            excludeIds={new Set(products.map((p) => p.id))}
            onPick={(ids) => handleAddProducts(ids)}
          />
        </Tabs.Content>

        {/* SETTINGS TAB */}
        <Tabs.Content
          value="settings"
          className="flex flex-col gap-y-3 pt-3"
        >
          <SettingsForm
            detail={detail}
            fallbackName={fallbackName}
            handle={handle}
            onSaved={() => {
              void loadDetail()
              onMutated()
            }}
          />
        </Tabs.Content>
      </Tabs>
    </div>
  )
}

// ============================================================
// PRODUCT ROW (inside drawer)
// ============================================================

const ProductRow = ({
  product,
  onRemove,
}: {
  product: DrawerProduct
  onRemove: () => void
}) => {
  const brandLink = Array.isArray(product.brand)
    ? product.brand[0]
    : product.brand
  return (
    <li className="flex items-center gap-x-3 rounded-md border border-ui-border-base bg-ui-bg-base p-2">
      <div className="w-10 h-10 flex-shrink-0 bg-ui-bg-subtle rounded overflow-hidden flex items-center justify-center">
        {product.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs text-ui-fg-muted">—</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={`/app/products/${product.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-ui-fg-interactive hover:underline truncate block"
        >
          {product.title ?? "(no title)"}
        </a>
        <Text size="xsmall" className="text-ui-fg-muted truncate">
          {[
            brandLink?.name,
            product.type?.value,
            product.status === "published" ? null : product.status,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Text>
      </div>
      <Button size="small" variant="danger" onClick={onRemove}>
        Remove
      </Button>
    </li>
  )
}

// ============================================================
// SEARCH PICKER (for the Add tab)
// ============================================================

const ProductSearchPicker = ({
  excludeIds,
  onPick,
}: {
  excludeIds: Set<string>
  onPick: (ids: string[]) => void
}) => {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<DrawerProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: "20",
        fields:
          "id,title,handle,status,thumbnail,type.value,brand.handle,brand.name",
      })
      const res = await fetch(`/admin/products?${params.toString()}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`Search returned HTTP ${res.status}`)
      const json = (await res.json()) as { products: DrawerProduct[] }
      setResults(json.products ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? "Search failed")
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void search(q)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q, search])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = () => {
    if (selected.size === 0) return
    onPick(Array.from(selected))
    setSelected(new Set())
    setQ("")
    setResults([])
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Input
        type="search"
        placeholder="Search all products by title…"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      {loading ? (
        <Text size="small" className="text-ui-fg-muted">
          Searching…
        </Text>
      ) : results.length === 0 && q.trim() ? (
        <Text size="small" className="text-ui-fg-muted">
          No matches.
        </Text>
      ) : (
        <ul className="flex flex-col gap-y-2">
          {results.map((p) => {
            const isInCategory = excludeIds.has(p.id)
            const isSelected = selected.has(p.id)
            const brandLink = Array.isArray(p.brand) ? p.brand[0] : p.brand
            return (
              <li
                key={p.id}
                className={[
                  "flex items-center gap-x-3 rounded-md border bg-ui-bg-base p-2",
                  isInCategory
                    ? "border-ui-border-base opacity-50"
                    : isSelected
                      ? "border-ui-border-interactive"
                      : "border-ui-border-base",
                ].join(" ")}
              >
                <div className="w-10 h-10 flex-shrink-0 bg-ui-bg-subtle rounded overflow-hidden flex items-center justify-center">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-ui-fg-muted">—</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Text className="text-sm font-medium truncate">
                    {p.title ?? "(no title)"}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted truncate">
                    {[brandLink?.name, p.type?.value]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Text>
                </div>
                {isInCategory ? (
                  <Badge color="grey">Already in</Badge>
                ) : (
                  <Button
                    size="small"
                    variant={isSelected ? "primary" : "secondary"}
                    onClick={() => toggle(p.id)}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {selected.size > 0 ? (
        <div className="flex items-center justify-between gap-x-3 pt-2 border-t border-ui-border-base">
          <Text size="small" className="text-ui-fg-base">
            {selected.size} selected
          </Text>
          <Button size="small" onClick={submit}>
            Add to category
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// ============================================================
// SETTINGS FORM
// ============================================================

const SettingsForm = ({
  detail,
  fallbackName,
  handle,
  onSaved,
}: {
  detail: CategoryDetail | null
  fallbackName: string
  handle: string
  onSaved: () => void
}) => {
  const [name, setName] = useState("")
  const [hideFromMenu, setHideFromMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setName(detail?.name ?? fallbackName)
    setHideFromMenu(detail?.is_hidden_from_menu ?? false)
    setDirty(false)
  }, [detail, fallbackName])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/admin/shop-categories/${handle}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          is_hidden_from_menu: hideFromMenu,
        }),
      })
      if (!res.ok) throw new Error(`Save returned HTTP ${res.status}`)
      toast.success("Saved")
      setDirty(false)
      onSaved()
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="shop-category-name">Display name</Label>
        <Input
          id="shop-category-name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setDirty(true)
          }}
          placeholder={fallbackName}
        />
        <Text size="xsmall" className="text-ui-fg-muted">
          Changes the label shown on the storefront, the mega-menu, the
          breadcrumbs, and the admin product detail page. Handle stays{" "}
          <code className="bg-ui-bg-subtle px-1 rounded">{handle}</code>.
        </Text>
      </div>

      <div className="flex items-start justify-between gap-x-4 rounded-md border border-ui-border-base p-3">
        <div className="flex-1">
          <Label htmlFor="hide-from-menu" className="cursor-pointer">
            Hide from mega-menu
          </Label>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Removes this category from the storefront drill-down menu. Direct
            URLs like{" "}
            <code className="bg-ui-bg-subtle px-1 rounded">
              /categories/{handle}
            </code>{" "}
            still work — use this to declutter the menu without breaking
            existing links or SEO. Drives{" "}
            <code className="bg-ui-bg-subtle px-1 rounded">
              metadata.is_hidden_from_menu
            </code>{" "}
            on the category row.
          </Text>
        </div>
        <Switch
          id="hide-from-menu"
          checked={hideFromMenu}
          onCheckedChange={(v) => {
            setHideFromMenu(v)
            setDirty(true)
          }}
        />
      </div>

      <Button onClick={save} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  )
}

// ============================================================
// SUMMARY TILE
// ============================================================

const SummaryTile = ({
  label,
  value,
  tone,
  loading,
  tooltip,
}: {
  label: string
  value: number | null
  tone?: "green" | "orange" | "red"
  loading: boolean
  tooltip?: string
}) => {
  const toneClass =
    tone === "red"
      ? "text-ui-tag-red-text"
      : tone === "orange"
        ? "text-ui-tag-orange-text"
        : tone === "green"
          ? "text-ui-tag-green-text"
          : "text-ui-fg-base"
  return (
    <div className="rounded-md border border-ui-border-base bg-ui-bg-base p-4 flex flex-col gap-y-1">
      <Text size="xsmall" className="text-ui-fg-muted" title={tooltip}>
        {label}
      </Text>
      <Text className={`text-2xl font-semibold ${toneClass}`}>
        {loading && value === null ? "…" : (value ?? 0).toLocaleString()}
      </Text>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Shop categories",
  icon: BuildingStorefront,
})

export default ShopCategoriesPage

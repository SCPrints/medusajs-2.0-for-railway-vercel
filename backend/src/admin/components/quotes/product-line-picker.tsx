import { Button, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Catalog product + variant search for the Quotes line-item editor. Adapted
 * from the POS `ProductSearchPanel` — same `/admin/products` query with a
 * region context so `calculated_price` is populated. On variant click it hands
 * the parent a fully-resolved, priced line (no SKU typing, no free-text).
 */

export type PickedProductLine = {
  product_id: string
  variant_id: string
  product_handle: string | null
  thumbnail: string | null
  title: string
  /** Catalog price in MAJOR units (dollars), or null if unpriced in region. */
  unit_price: number | null
}

type PickerVariant = {
  id: string
  title: string
  sku: string | null
  calculated_price?: { calculated_amount: number; currency_code: string } | null
}

type PickerProduct = {
  id: string
  title: string
  handle: string | null
  thumbnail: string | null
  variants: PickerVariant[]
}

const fmtMoney = (major: number | null | undefined, currency = "AUD") => {
  if (major == null || Number.isNaN(major)) return "—"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(major)
}

export function ProductLinePicker({
  regionId,
  onPick,
  onClose,
}: {
  regionId: string | null
  onPick: (line: PickedProductLine) => void
  onClose?: () => void
}) {
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => void search(query), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, regionId])

  const search = async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      params.set("limit", "20")
      params.set(
        "fields",
        "id,title,handle,thumbnail,variants.id,variants.title,variants.sku,variants.calculated_price.*"
      )
      if (regionId) params.set("region_id", regionId)
      const res = await fetch(`/admin/products?${params}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const json = (await res.json()) as { products: PickerProduct[] }
      setProducts(json.products ?? [])
    } catch (err: any) {
      setError(err?.message ?? "Search failed")
    } finally {
      setLoading(false)
    }
  }

  const pick = (product: PickerProduct, variant: PickerVariant) => {
    const unit_price = variant.calculated_price
      ? variant.calculated_price.calculated_amount
      : null
    onPick({
      product_id: product.id,
      variant_id: variant.id,
      product_handle: product.handle ?? null,
      thumbnail: product.thumbnail ?? null,
      title: `${product.title}${variant.title ? ` — ${variant.title}` : ""}`,
      unit_price,
    })
  }

  return (
    <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2 bg-ui-bg-subtle">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search products by name, SKU, handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {onClose ? (
          <Button size="small" variant="transparent" onClick={onClose}>
            Done
          </Button>
        ) : null}
      </div>

      {!regionId ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Loading region… prices will appear once it resolves.
        </Text>
      ) : null}
      {loading ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Searching…
        </Text>
      ) : null}
      {error ? (
        <Text size="xsmall" className="text-ui-tag-red-icon">
          {error}
        </Text>
      ) : null}

      {!loading && !error ? (
        <ul className="max-h-72 overflow-y-auto divide-y divide-ui-border-base">
          {products.length === 0 ? (
            <Text size="xsmall" className="text-ui-fg-muted py-2">
              {query ? "No products found." : "Type to search products."}
            </Text>
          ) : (
            products.map((p) => {
              const oneVariant = (p.variants ?? []).length === 1
              const only = (p.variants ?? [])[0]
              const isExpanded = expanded === p.id
              return (
                <li key={p.id} className="py-1.5">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left hover:bg-ui-bg-base rounded-md px-2 py-1"
                    onClick={() =>
                      oneVariant && only
                        ? pick(p, only)
                        : setExpanded(isExpanded ? null : p.id)
                    }
                  >
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnail}
                        alt={p.title}
                        className="w-9 h-9 rounded object-cover bg-ui-bg-base"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-ui-bg-base" />
                    )}
                    <div className="flex-1 min-w-0">
                      <Text size="small" className="truncate font-medium">
                        {p.title}
                      </Text>
                      {oneVariant && only?.calculated_price ? (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {fmtMoney(
                            only.calculated_price.calculated_amount,
                            only.calculated_price.currency_code.toUpperCase()
                          )}
                        </Text>
                      ) : !oneVariant ? (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {(p.variants ?? []).length} variants — pick one
                        </Text>
                      ) : null}
                    </div>
                  </button>
                  {isExpanded && !oneVariant ? (
                    <ul className="ml-12 mt-1 space-y-1">
                      {(p.variants ?? []).map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-ui-bg-base flex justify-between gap-2"
                            onClick={() => pick(p, v)}
                          >
                            <span className="truncate">{v.title}</span>
                            {v.calculated_price ? (
                              <span className="text-ui-fg-muted shrink-0">
                                {fmtMoney(
                                  v.calculated_price.calculated_amount,
                                  v.calculated_price.currency_code.toUpperCase()
                                )}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}

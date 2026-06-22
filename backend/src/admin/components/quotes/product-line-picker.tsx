import { Button, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import {
  pickVariantBasePrice,
  type VariantPriceRow,
} from "../../lib/variant-base-price"

/**
 * Catalog product + variant search for the Quotes line-item editor. Queries
 * `/admin/products` for RAW `variants.prices` and picks the AUD base tier
 * (`pickVariantBasePrice`). It deliberately does NOT request `calculated_price`: the
 * admin route strips `region_id`/`currency_code` from the query, so a
 * calculated_price request with no pricing context throws INVALID_DATA → 400
 * (the original "Search failed (400)" bug). On variant click it hands the
 * parent a fully-resolved, priced line (no SKU typing, no free-text).
 */

export type PickedProductLine = {
  product_id: string
  /**
   * Null for a "whole product" line — staff add the product without committing
   * to a size/colour. The accept route resolves a representative variant at
   * order time (sizes can be adjusted in the cart).
   */
  variant_id: string | null
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
  /**
   * Raw catalogue price rows (NOT `calculated_price`). See `pickVariantBasePrice`
   * for why raw prices are read here — requesting `calculated_price` on the admin
   * route 400s for lack of a pricing context.
   */
  prices?: VariantPriceRow[] | null
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
  onPick,
  onClose,
}: {
  /**
   * Accepted for call-site compatibility but no longer used — pricing comes
   * from raw `variants.prices` (see `pickVariantBasePrice`), so no region/pricing
   * context is needed and passing one to /admin/products would be stripped.
   */
  regionId?: string | null
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
  }, [query])

  const search = async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      params.set("limit", "20")
      // Request RAW prices, not `calculated_price`: the admin /admin/products
      // route strips region_id/currency_code from the query, so asking for
      // calculated_price with no pricing context makes the pricing module throw
      // INVALID_DATA → HTTP 400 (the "Search failed (400)" bug). Raw prices need
      // no pricing context. We pick the AUD base tier via pickVariantBasePrice().
      params.set(
        "fields",
        "id,title,handle,thumbnail,variants.id,variants.title,variants.sku,variants.prices.*"
      )
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
    const base = pickVariantBasePrice(variant.prices)
    const unit_price = base ? base.amount : null
    onPick({
      product_id: product.id,
      variant_id: variant.id,
      product_handle: product.handle ?? null,
      thumbnail: product.thumbnail ?? null,
      title: `${product.title}${variant.title ? ` — ${variant.title}` : ""}`,
      unit_price,
    })
  }

  // Cheapest base price across a product's variants — the "from" price shown for
  // a whole-product line (no specific size/colour committed yet).
  const cheapestBase = (
    product: PickerProduct
  ): { amount: number; currency_code: string } | null => {
    const bases = (product.variants ?? [])
      .map((v) => pickVariantBasePrice(v.prices))
      .filter((b): b is { amount: number; currency_code: string } => b != null)
    if (bases.length === 0) return null
    return bases.slice().sort((a, b) => a.amount - b.amount)[0]
  }

  // Add the whole product without committing to a size/colour. variant_id stays
  // null; the accept route resolves a representative variant at order time.
  const pickWholeProduct = (product: PickerProduct) => {
    const from = cheapestBase(product)
    onPick({
      product_id: product.id,
      variant_id: null,
      product_handle: product.handle ?? null,
      thumbnail: product.thumbnail ?? null,
      title: product.title,
      unit_price: from ? from.amount : null,
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
              const onlyBase = only ? pickVariantBasePrice(only.prices) : null
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
                      {oneVariant && onlyBase ? (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {fmtMoney(
                            onlyBase.amount,
                            onlyBase.currency_code.toUpperCase()
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
                      <li>
                        <button
                          type="button"
                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-ui-bg-base flex justify-between gap-2 text-ui-fg-interactive"
                          onClick={() => pickWholeProduct(p)}
                        >
                          <span className="truncate">
                            + Add whole product (choose sizes at order time)
                          </span>
                          {cheapestBase(p) ? (
                            <span className="text-ui-fg-muted shrink-0">
                              from{" "}
                              {fmtMoney(
                                cheapestBase(p)!.amount,
                                cheapestBase(p)!.currency_code.toUpperCase()
                              )}
                            </span>
                          ) : null}
                        </button>
                      </li>
                      {(p.variants ?? []).map((v) => {
                        const vBase = pickVariantBasePrice(v.prices)
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-ui-bg-base flex justify-between gap-2"
                              onClick={() => pick(p, v)}
                            >
                              <span className="truncate">{v.title}</span>
                              {vBase ? (
                                <span className="text-ui-fg-muted shrink-0">
                                  {fmtMoney(
                                    vBase.amount,
                                    vBase.currency_code.toUpperCase()
                                  )}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        )
                      })}
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

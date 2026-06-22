import { Button, Heading, Input, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { pickVariantBasePrice } from "../../../lib/variant-base-price"
import { HelpTooltip } from "../../../components/reports/help-tooltip"
import type {
  POSLineItem,
  POSProduct,
  POSProductVariant,
  POSRegion,
} from "../types"
import { formatMoney, ulid } from "../utils"

type Props = {
  region: POSRegion | null
  onAddItem: (item: POSLineItem) => void
  onOpenCustomizer: () => void
}

export const ProductSearchPanel = ({
  region,
  onAddItem,
  onOpenCustomizer,
}: Props) => {
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<POSProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      void search(query)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, region?.id])

  const search = async (q: string) => {
    if (!region) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      params.set("limit", "20")
      // Request RAW prices, not `calculated_price`: the admin /admin/products
      // route strips region_id/currency_code, so a calculated_price request
      // with no pricing context throws INVALID_DATA → HTTP 400. Raw prices need
      // no context; pickVariantBasePrice() picks the AUD base tier.
      params.set(
        "fields",
        "id,title,handle,thumbnail,variants.id,variants.title,variants.sku,variants.prices.*"
      )

      const res = await fetch(`/admin/products?${params}`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(`Search failed (${res.status})`)
      }
      const json = (await res.json()) as { products: POSProduct[] }
      setProducts(json.products ?? [])
    } catch (err: any) {
      setError(err?.message ?? "Search failed")
    } finally {
      setLoading(false)
    }
  }

  const addVariant = (product: POSProduct, variant: POSProductVariant) => {
    const base = pickVariantBasePrice(variant.prices)
    const priceCents = base ? Math.round(base.amount * 100) : null
    const item: POSLineItem = {
      id: ulid(),
      kind: "standard",
      variant_id: variant.id,
      product_id: product.id,
      product_title: product.title,
      variant_title: variant.title,
      quantity: 1,
      unit_price_cents: priceCents,
      metadata: {},
      added_at: new Date().toISOString(),
    }
    onAddItem(item)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-ui-border-base">
        <Heading level="h2" className="mb-3 flex items-center">
          Products
          <HelpTooltip
            text={{
              title: "Adding products",
              body: "Live search across the catalogue scoped to the selected region (so prices are accurate). Click a single-variant product to drop it straight in the cart; multi-variant products expand so you can pick the size/colour.",
              bullets: [
                "Same standard variant added twice auto-merges (quantity bumps).",
                "Custom designs always stay as separate cart lines.",
              ],
            }}
          />
        </Heading>
        <Input
          placeholder="Search by name, SKU, handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="flex items-center gap-1 mt-2">
          <Button
            variant="secondary"
            size="small"
            className="flex-1"
            onClick={onOpenCustomizer}
          >
            + Add custom design (open customizer)
          </Button>
          <HelpTooltip
            text={{
              title: "Custom designs",
              body: "Opens the storefront customizer in a popup keyed to this sale. Design the artwork there, click Add to cart in the popup, and the line lands here tagged ‘Custom’ within ~2 seconds.",
              bullets: [
                "Allow popups for the admin domain if the window doesn't open.",
                "Full Fabric.js metadata is preserved — the resulting order works with the mockup PDF generator, customizer downloads widget, and print-details widget exactly like a self-serve online order.",
              ],
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && (
          <Text size="small" className="text-ui-fg-muted py-3">
            Loading…
          </Text>
        )}
        {error && (
          <Text size="small" className="text-ui-fg-error py-3">
            {error}
          </Text>
        )}
        {!loading && !error && products.length === 0 && (
          <Text size="small" className="text-ui-fg-muted py-3">
            {query ? "No products found." : "Type to search products."}
          </Text>
        )}

        <ul className="divide-y divide-ui-border-base">
          {products.map((p) => {
            const isExpanded = expanded === p.id
            const oneVariant = (p.variants ?? []).length === 1
            const variantToShow = (p.variants ?? [])[0]
            const showBase = variantToShow
              ? pickVariantBasePrice(variantToShow.prices)
              : null
            return (
              <li key={p.id} className="py-2">
                <button
                  className="w-full flex items-center gap-3 text-left hover:bg-ui-bg-subtle rounded-md px-2 py-1"
                  onClick={() => {
                    if (oneVariant && variantToShow) {
                      addVariant(p, variantToShow)
                    } else {
                      setExpanded(isExpanded ? null : p.id)
                    }
                  }}
                >
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnail}
                      alt={p.title}
                      className="w-10 h-10 rounded object-cover bg-ui-bg-subtle"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-ui-bg-subtle" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Text size="small" className="truncate font-medium">
                      {p.title}
                    </Text>
                    {oneVariant && showBase && (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {formatMoney(
                          Math.round(showBase.amount * 100),
                          showBase.currency_code.toUpperCase()
                        )}
                      </Text>
                    )}
                  </div>
                </button>

                {isExpanded && !oneVariant && (
                  <ul className="ml-12 mt-1 space-y-1">
                    {(p.variants ?? []).map((v) => {
                      const vBase = pickVariantBasePrice(v.prices)
                      return (
                        <li key={v.id}>
                          <button
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-ui-bg-subtle flex justify-between"
                            onClick={() => addVariant(p, v)}
                          >
                            <span>{v.title}</span>
                            {vBase && (
                              <span className="text-ui-fg-muted">
                                {formatMoney(
                                  Math.round(vBase.amount * 100),
                                  vBase.currency_code.toUpperCase()
                                )}
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

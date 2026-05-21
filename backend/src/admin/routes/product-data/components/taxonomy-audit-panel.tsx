import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { HelpTooltip } from "../../../components/reports/help-tooltip"

type SampleEntry = {
  id: string
  title: string
  handle: string
}

type AuditDimension = {
  count: number
  sample: SampleEntry[]
}

type AuditResponse = {
  total_products: number
  capped: boolean
  total_count_in_db: number | null
  missing_type: AuditDimension
  missing_demographic_tag: AuditDimension
  missing_shop_category: AuditDimension
}

type CardConfig = {
  key: keyof Pick<
    AuditResponse,
    "missing_type" | "missing_demographic_tag" | "missing_shop_category"
  >
  title: string
  description: string
  fixGuidance: string
}

const CARDS: CardConfig[] = [
  {
    key: "missing_type",
    title: "Missing product type",
    description:
      "Storefront filters, the chatbot, and decoration pricing all key off product_type. No type = no filter match.",
    fixGuidance:
      "Open the product, set Type from the right rail. Or run the backfill script to retry title inference.",
  },
  {
    key: "missing_demographic_tag",
    title: "Missing demographic tag",
    description:
      "Audience-aware browse (Mens / Womens / Kids) reads the tag, not the title. No tag = product hidden from those drill-downs.",
    fixGuidance:
      "Open the product, add a Tag of \"Men\", \"Women\", \"Kids\", or \"Unisex\" from the Organize rail.",
  },
  {
    key: "missing_shop_category",
    title: "Missing Shop category",
    description:
      "The mega-menu uses Shop categories like `mens-polos` / `kids-t-shirts`. Type + demographic combine to assign these automatically — if either is missing, the category isn't set.",
    fixGuidance:
      "Fix type or demographic tag first, then re-run the backfill script or re-import. Manual category assignment works too.",
  },
]

const TaxonomyAuditPanel = () => {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/taxonomy-audit", {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`Audit returned HTTP ${res.status}`)
      const json = (await res.json()) as AuditResponse
      setData(json)
    } catch (err: any) {
      const msg = err?.message ?? "Failed to load taxonomy audit"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-start justify-between gap-x-4">
        <div className="flex-1">
          <Heading level="h2" className="flex items-center text-base">
            Taxonomy audit
            <HelpTooltip
              text={{
                title: "Taxonomy audit",
                body: "Live count of published products that are missing one of the three signals the storefront needs to group products by brand/type/audience. Recomputed on every refresh — no caching.",
                bullets: [
                  "Missing product type: storefront filters, the chatbot, and decoration pricing don't see the product at all.",
                  "Missing demographic tag: hidden from the Mens / Womens / Kids drill-down in the mega-menu and audience-aware reports.",
                  "Missing Shop category: not pinned to a `mens-polos` / `kids-t-shirts` etc. node, so it won't surface in the mega-menu.",
                  "Click a row to open the product detail in a new tab — fix from there. Or run `backfill-product-taxonomy.ts` to retry title inference on every product.",
                ],
              }}
            />
          </Heading>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            {data
              ? `Across ${data.total_products} published product${data.total_products === 1 ? "" : "s"}${data.capped ? " (capped — actual catalog is larger)" : ""}`
              : "Loading…"}
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-ui-border-error bg-ui-tag-red-bg p-4">
          <Text size="small" className="text-ui-tag-red-text">
            {error}
          </Text>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map((card) => {
          const dim = data?.[card.key] ?? { count: 0, sample: [] }
          const isExpanded = expanded.has(card.key)
          const counterColor: "red" | "orange" | "green" =
            dim.count === 0 ? "green" : dim.count < 20 ? "orange" : "red"
          return (
            <div
              key={card.key}
              className="rounded-md border border-ui-border-base bg-ui-bg-base flex flex-col"
            >
              <div className="px-4 py-3 border-b border-ui-border-base">
                <div className="flex items-center justify-between gap-x-2">
                  <Heading level="h3" className="text-sm">
                    {card.title}
                  </Heading>
                  <Badge color={counterColor}>{loading ? "…" : dim.count}</Badge>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  {card.description}
                </Text>
              </div>
              <div className="px-4 py-3 flex-1">
                {dim.count === 0 ? (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Nothing missing.
                  </Text>
                ) : (
                  <>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Showing {Math.min(dim.sample.length, isExpanded ? dim.sample.length : 5)} of {dim.count} affected.
                    </Text>
                    <ul className="mt-2 flex flex-col gap-y-1">
                      {dim.sample
                        .slice(0, isExpanded ? dim.sample.length : 5)
                        .map((row) => (
                          <li key={row.id}>
                            <a
                              href={`/app/products/${row.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-ui-fg-interactive hover:underline text-xs"
                            >
                              {row.title}
                            </a>
                          </li>
                        ))}
                    </ul>
                    {dim.sample.length > 5 ? (
                      <button
                        className="text-ui-fg-interactive hover:underline text-xs mt-2"
                        onClick={() => toggle(card.key)}
                      >
                        {isExpanded ? "Show less" : `Show ${dim.sample.length - 5} more`}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              <div className="px-4 py-3 border-t border-ui-border-base bg-ui-bg-subtle rounded-b-md">
                <Text size="xsmall" className="text-ui-fg-muted">
                  <strong>Fix:</strong> {card.fixGuidance}
                </Text>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4">
        <Text size="xsmall" className="text-ui-fg-muted">
          Bulk fix: run{" "}
          <code className="bg-ui-bg-base px-1 rounded">
            npx medusa exec src/scripts/backfill-product-taxonomy.ts
          </code>{" "}
          from the backend to retry title-based inference on every product.
          Set <code className="bg-ui-bg-base px-1 rounded">DRY_RUN=1</code> first to preview
          the changes before committing.
        </Text>
      </div>
    </Container>
  )
}

export default TaxonomyAuditPanel

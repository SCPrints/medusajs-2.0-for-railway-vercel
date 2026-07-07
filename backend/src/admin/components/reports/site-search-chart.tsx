import { Text } from "@medusajs/ui"

import { ReportCard } from "./report-card"
import { PALETTE } from "../../lib/reports/palette"
import { buildCsv } from "../../lib/reports/csv"
import { useReportData } from "../../lib/reports/use-report-data"
import { KpiTile } from "./kpi-tile"

type Response = {
  from: string
  to: string
  summary: {
    total_searches: number
    distinct_queries: number
    zero_result_searches: number
    zero_result_share: number
  }
  top_queries: Array<{ query: string; count: number; avg_results: number }>
  top_zero_result_queries: Array<{ query: string; count: number }>
  module_available: boolean
}

export const SiteSearchChart = ({
  fromIso,
  toIso,
  regionId,
}: {
  fromIso: string
  toIso: string
  regionId: string | null
}) => {
  const { data, loading, error } = useReportData<Response>("/admin/reports/site-search", {
    from: fromIso,
    to: toIso,
    region_id: regionId,
  })


  const summary = data?.summary
  const zeroPct = summary
    ? (summary.zero_result_share * 100).toFixed(1)
    : "0.0"

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text)
    }
  }

  return (
    <ReportCard
      title="Internal site search"
      caption="What customers type into the search bar. Zero-result queries are gold for merchandising — they tell you what people want that you don't surface (or don't stock)."
      help={{
        title: "Internal site search",
        body: "Every query typed into the storefront search bar in the window. The two columns to read first are zero-result queries (customers asking for something you don't have or can't surface) and high-volume queries (proven demand).",
        bullets: [
          "Zero-result queries are gold: each one is a customer who couldn't find what they wanted. Decide per query — add the product, fix the indexing, or add a synonym so they land on the right thing.",
          "High-volume queries that *do* return results but have low click-through usually mean the result page is poor. Check ranking and PDP-thumbnail quality.",
          "If a particular product name shows up frequently in search but is also on a homepage tile, your nav is failing — customers shouldn't need to search for what's on screen.",
        ],
      }}
      loading={loading}
      error={error}
      csv={
        !data || data.summary.total_searches === 0
          ? undefined
          : {
              filenameBase: "site-search",
              build: () => {
                const rows: any[] = [
                  ["Top queries", "Count", "Avg results"],
                  ...data.top_queries.map((q) => [
                    q.query,
                    q.count,
                    q.avg_results,
                  ]),
                  [],
                  ["Zero-result queries", "Count"],
                  ...data.top_zero_result_queries.map((q) => [q.query, q.count]),
                ]
                return buildCsv(rows[0], rows.slice(1))
              },
            }
      }
    >
      {data && !data.module_available ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Search-event logging isn't available — the search-log module
          may not be registered on this backend yet, or the migration
          hasn't run.
        </Text>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <KpiTile
          label="Total searches"
          value={String(summary?.total_searches ?? 0)}
        />
        <KpiTile
          label="Distinct queries"
          value={String(summary?.distinct_queries ?? 0)}
        />
        <KpiTile
          label="Zero-result rate"
          value={`${zeroPct}%`}
          color={
            summary && summary.zero_result_share > 0.2
              ? PALETTE.amber600
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
        <div className="flex flex-col gap-y-2">
          <Text size="small" className="font-semibold">
            Top queries
          </Text>
          {(data?.top_queries ?? []).length === 0 ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              No searches in period.
            </Text>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data?.top_queries.map((q, i) => (
                  <tr
                    key={q.query + i}
                    className="border-b border-ui-border-base"
                  >
                    <td className="px-2 py-1 text-ui-fg-muted tabular-nums w-6">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1 truncate font-mono text-xs">
                      {q.query}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums w-12">
                      {q.count}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums w-16 text-ui-fg-muted">
                      {q.avg_results}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex flex-col gap-y-2">
          <Text size="small" className="font-semibold">
            Zero-result queries (always returned 0)
          </Text>
          {(data?.top_zero_result_queries ?? []).length === 0 ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              No zero-result queries — your catalog covers searches well.
            </Text>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data?.top_zero_result_queries.map((q, i) => (
                  <tr
                    key={q.query + i}
                    className="border-b border-ui-border-base hover:bg-ui-bg-subtle cursor-pointer"
                    onClick={() => copyToClipboard(q.query)}
                    title="Click to copy"
                  >
                    <td className="px-2 py-1 text-ui-fg-muted tabular-nums w-6">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1 truncate font-mono text-xs">
                      {q.query}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums w-12">
                      {q.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ReportCard>
  )
}

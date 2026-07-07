import { Button, Container, Heading, Text } from "@medusajs/ui"
import { ArrowDownTray } from "@medusajs/icons"
import type { ReactNode } from "react"

import { downloadCsv, timestampedFilename } from "../../lib/reports/csv"
import { HelpTooltip, type HelpContent } from "./help-tooltip"
import { LastUpdated } from "./last-updated"
import { SkeletonBars } from "./skeleton-chart"

/**
 * Standard wrapper for every report on the Reports page. Title above,
 * caption below, chart in between. Keeps spacing/typography consistent
 * across reports.
 *
 * Pass `csv` to render a "Download CSV" icon button in the card header.
 * The function is called lazily when clicked — return null/undefined to
 * suppress the download (e.g., no data yet).
 *
 * Other optional props:
 *   - `help`        — text rendered as a `?` tooltip next to the title
 *   - `loadedAt`    — ms timestamp; renders "Updated 12s ago" in the header
 *   - `exportPng`   — function called to export the chart as PNG (handler should grab the DOM node itself)
 */
export const ReportCard = ({
  title,
  caption,
  loading,
  error,
  children,
  rightAccessory,
  csv,
  help,
  loadedAt = null,
}: {
  title: string
  caption?: string
  loading?: boolean
  error?: string | null
  children: ReactNode
  rightAccessory?: ReactNode
  csv?: {
    filenameBase: string
    build: () =>
      | { content: string; filename?: string }
      | string
      | null
      | undefined
  }
  help?: HelpContent
  loadedAt?: number | null
}) => {
  return (
    <Container className="flex flex-col gap-y-3 p-4">
      <div className="flex items-start justify-between gap-x-3">
        <div className="flex flex-col gap-y-0.5">
          <Heading level="h2" className="text-base font-semibold">
            {title}
            {help ? <HelpTooltip text={help} /> : null}
          </Heading>
          {caption ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {caption}
            </Text>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-x-2">
          {loadedAt && !loading && !error ? (
            <LastUpdated loadedAt={loadedAt} />
          ) : null}
          {rightAccessory}
          {csv ? (
            <Button
              size="small"
              variant="transparent"
              onClick={() => {
                const result = csv.build()
                if (!result) return
                if (typeof result === "string") {
                  downloadCsv(timestampedFilename(csv.filenameBase), result)
                } else {
                  downloadCsv(
                    result.filename ?? timestampedFilename(csv.filenameBase),
                    result.content
                  )
                }
              }}
              title="Download CSV"
            >
              <ArrowDownTray /> CSV
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Text size="small" className="text-ui-tag-red-icon">
          {error}
        </Text>
      ) : null}
      {loading && !error ? <SkeletonBars /> : null}
      {!loading && !error ? children : null}
    </Container>
  )
}

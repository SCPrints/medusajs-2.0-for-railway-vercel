import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"

/**
 * Screen-print colour verification + one-click reprice. Shows every screen-
 * printed line with its artwork, the customer's declared colour count, the
 * client-side detection result, and any "print it anyway" confirmation. Staff
 * enter the ACTUAL colour counts at art review and hit Reprice — the backend
 * runs an order edit (line unit price + setup-line screens) in one shot.
 */

type ScreenBreakdownEntry = {
  side: string
  colours: number
  effectiveColours: number
  darkGarment: boolean
  heavyGarment: boolean
  unitPriceMajor: number
}

type ScreenLine = {
  id: string
  label: string
  quantity: number
  breakdown: ScreenBreakdownEntry[]
  configs: Record<
    string,
    { detectedColours?: number; mismatchConfirmed?: boolean }
  >
  mockupBySide: Record<string, string | null>
  repricedAt: string | null
}

const sideLabel = (side: string) => side.replace(/_/g, " ")

const parseScreenLines = (items: Array<Record<string, any>>): ScreenLine[] => {
  const out: ScreenLine[] = []
  for (const item of items) {
    const design = item?.metadata?.customizerDesign
    const server = design?.pricing?.server
    const breakdown = server?.screen_breakdown
    if (!Array.isArray(breakdown) || breakdown.length === 0) continue
    const configs: ScreenLine["configs"] = {}
    const rawConfigs = design?.sideScreenConfigs
    if (rawConfigs && typeof rawConfigs === "object") {
      for (const [side, cfg] of Object.entries(rawConfigs as Record<string, any>)) {
        configs[side] = {
          detectedColours: typeof cfg?.detectedColours === "number" ? cfg.detectedColours : undefined,
          mismatchConfirmed: cfg?.mismatchConfirmed === true,
        }
      }
    }
    const mockupBySide: Record<string, string | null> = {}
    for (const artifact of design?.artifacts ?? []) {
      if (artifact?.side) {
        mockupBySide[artifact.side] = artifact.mockupUrl ?? artifact.printUrl ?? null
      }
    }
    out.push({
      id: item.id,
      label: item.product_title || item.title || "Custom design",
      quantity: item.quantity ?? 1,
      breakdown,
      configs,
      mockupBySide,
      repricedAt: typeof server?.screen_repriced_at === "string" ? server.screen_repriced_at : null,
    })
  }
  return out
}

const OrderScreenColourCheckWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const screenLines = useMemo(
    () => parseScreenLines((data?.items ?? []) as Array<Record<string, any>>),
    [data?.items]
  )
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({})
  const [busyLine, setBusyLine] = useState<string | null>(null)

  if (!orderId || screenLines.length === 0) return null

  const reprice = async (line: ScreenLine) => {
    const colours = edits[line.id] ?? {}
    const payload: Record<string, number> = {}
    for (const entry of line.breakdown) {
      payload[entry.side] = colours[entry.side] ?? entry.colours
    }
    setBusyLine(line.id)
    try {
      const res = await fetch(`/admin/orders/${orderId}/screen-reprice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_item_id: line.id, colours_by_side: payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`)
      toast.success(
        `Repriced: unit $${json.new_unit_price?.toFixed?.(2) ?? json.new_unit_price} · ${json.setup_screens} setup screens.`
      )
      window.location.reload()
    } catch (err: any) {
      toast.error(err?.message ?? "Reprice failed.")
    } finally {
      setBusyLine(null)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2" className="flex items-center">
          Screen print — colour check
          <HelpTooltip
            text={{
              title: "Screen colour verification",
              body: "Screen lines are priced by the customer's declared ink-colour count. Verify it against the artwork at art review; correct + reprice here if it's wrong.",
              bullets: [
                "'Detected' is the automatic artwork analysis shown to the customer.",
                "'Confirmed fewer' means the customer explicitly chose to collapse their art to fewer colours — honour it.",
                "Reprice runs an order edit: new line price + corrected setup-screen quantity in one step.",
              ],
            }}
          />
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Verify declared ink colours against the artwork before production. Reprice
          adjusts the invoice automatically.
        </Text>
      </div>
      <div className="flex flex-col divide-y">
        {screenLines.map((line) => (
          <div key={line.id} className="flex flex-col gap-3 px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <Text size="small" weight="plus">
                {line.label} · qty {line.quantity}
              </Text>
              {line.repricedAt ? (
                <Badge size="2xsmall" color="green">
                  repriced {new Date(line.repricedAt).toLocaleDateString()}
                </Badge>
              ) : null}
            </div>
            {line.breakdown.map((entry) => {
              const cfg = line.configs[entry.side] ?? {}
              const detected = cfg.detectedColours
              const mismatch = typeof detected === "number" && detected > entry.colours
              const value = edits[line.id]?.[entry.side] ?? entry.colours
              return (
                <div key={entry.side} className="flex items-center gap-3">
                  {line.mockupBySide[entry.side] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.mockupBySide[entry.side]!}
                      alt={`${sideLabel(entry.side)} artwork`}
                      className="h-14 w-14 rounded border border-ui-border-base object-contain bg-ui-bg-subtle"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded border border-dashed border-ui-border-base" />
                  )}
                  <div className="flex flex-1 flex-col gap-0.5">
                    <Text size="small" className="capitalize">
                      {sideLabel(entry.side)}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Declared {entry.colours} colour{entry.colours > 1 ? "s" : ""}
                      {typeof detected === "number" ? ` · detected ~${detected}` : ""}
                      {entry.darkGarment ? " · underbase" : ""}
                      {entry.heavyGarment ? " · heavy garment" : ""}
                    </Text>
                    {mismatch ? (
                      cfg.mismatchConfirmed ? (
                        <Badge size="2xsmall" color="blue">
                          customer confirmed fewer colours
                        </Badge>
                      ) : (
                        <Badge size="2xsmall" color="orange">
                          mismatch — verify before printing
                        </Badge>
                      )
                    ) : null}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-ui-fg-subtle">
                    Actual
                    <select
                      value={value}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [line.id]: {
                            ...(prev[line.id] ?? {}),
                            [entry.side]: Number(e.target.value),
                          },
                        }))
                      }
                      className="rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )
            })}
            <div className="flex justify-end">
              <Button
                size="small"
                variant="secondary"
                onClick={() => void reprice(line)}
                isLoading={busyLine === line.id}
              >
                Reprice line
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default withWidgetBoundary(OrderScreenColourCheckWidget, "order-screen-colour-check")

import { Text } from "@medusajs/ui"

import { PALETTE } from "../../lib/reports/palette"

/**
 * Shared KPI tile used across the report charts — replaces the 12 private
 * copies that used to live in individual chart files.
 *
 * The delta props cover every shape the copies had grown:
 * - `delta: number`            → "+x.x% vs prior" under the value, green/red by sign
 * - `delta: string`            → preformatted text inline next to the value (colour via `deltaColor`)
 * - `delta: { pp, positive }`  → "+x.xpp vs prior" inline, green/red by `positive`
 *   (`positive` is explicit because for some metrics a negative pp is good)
 * - `deltaPp` / `deltaPct`     → "+x.x(pp|%) vs prior" under the value, green/red by sign
 * - `noPrior`                  → text shown when a numeric `delta` is null (e.g. "no prior data")
 */
export const KpiTile = ({
  label,
  value,
  color,
  delta,
  deltaColor,
  deltaPp,
  deltaPct,
  noPrior,
}: {
  label: string
  value: string
  color?: string
  delta?: number | string | { pp: number; positive: boolean } | null
  deltaColor?: string
  deltaPp?: number | null
  deltaPct?: number | null
  noPrior?: string
}) => {
  const signColor = (positive: boolean) =>
    positive ? PALETTE.emerald600 : PALETTE.rose600

  // Inline extras (beside the value)
  let inline: React.ReactNode = null
  if (typeof delta === "string" && delta) {
    inline = (
      <Text size="xsmall" style={deltaColor ? { color: deltaColor } : undefined}>
        {delta}
      </Text>
    )
  } else if (delta && typeof delta === "object") {
    inline = (
      <Text size="xsmall" style={{ color: signColor(delta.positive) }}>
        {delta.pp > 0 ? "+" : ""}
        {delta.pp.toFixed(1)}pp vs prior
      </Text>
    )
  }

  // Below-value extras
  const below: Array<{ n: number; unit: string }> = []
  if (typeof delta === "number") below.push({ n: delta, unit: "%" })
  if (deltaPp != null) below.push({ n: deltaPp, unit: "pp" })
  else if (deltaPct != null) below.push({ n: deltaPct, unit: "%" })

  return (
    <div className="flex flex-col gap-y-0.5 px-3 py-2 rounded-md bg-ui-bg-subtle/50">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className="flex items-baseline gap-x-2">
        <Text
          className="text-2xl font-semibold tabular-nums"
          style={color ? { color } : undefined}
        >
          {value}
        </Text>
        {inline}
      </div>
      {below.map(({ n, unit }) => (
        <Text key={unit} size="xsmall" style={{ color: signColor(n >= 0) }}>
          {n >= 0 ? "+" : ""}
          {n.toFixed(1)}
          {unit} vs prior
        </Text>
      ))}
      {below.length === 0 && delta == null && noPrior ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {noPrior}
        </Text>
      ) : null}
    </div>
  )
}

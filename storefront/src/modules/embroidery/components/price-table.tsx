"use client"

import React from "react"
import { buildPriceTable } from "../lib/pricing"
import type { PricingConfig } from "../lib/types"

type Props = {
  config: PricingConfig
  highlightTierIndex?: number
  highlightRowIndex?: number
}

const PriceTable: React.FC<Props> = ({ config, highlightTierIndex, highlightRowIndex }) => {
  const { quantityTiers, rows } = buildPriceTable(config)

  return (
    <div className="overflow-x-auto rounded-md border border-ui-border-base">
      <table className="w-full text-left text-sm">
        <thead className="bg-ui-bg-subtle">
          <tr>
            <th className="px-3 py-2 font-medium text-ui-fg-base">Stitches</th>
            {quantityTiers.map((tier, idx) => (
              <th
                key={tier.label}
                className={`px-3 py-2 text-right font-medium ${
                  highlightTierIndex === idx ? "bg-ui-bg-highlight text-ui-fg-base" : "text-ui-fg-subtle"
                }`}
              >
                {tier.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-t border-ui-border-base ${
                row.isIncrementalRow ? "bg-ui-bg-subtle/40 italic" : ""
              } ${highlightRowIndex === rowIdx ? "bg-ui-bg-highlight" : ""}`}
            >
              <td className="px-3 py-2 text-ui-fg-base">{row.label}</td>
              {row.prices.map((price, colIdx) => (
                <td
                  key={colIdx}
                  className={`px-3 py-2 text-right tabular-nums ${
                    highlightTierIndex === colIdx && highlightRowIndex === rowIdx
                      ? "font-semibold text-ui-fg-base"
                      : "text-ui-fg-subtle"
                  }`}
                >
                  ${price.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PriceTable

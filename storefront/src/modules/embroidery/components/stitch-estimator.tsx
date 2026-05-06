"use client"

import React, { useEffect, useMemo, useState } from "react"
import { calculatePrice, PRICE_LEVELS, RETAIL_CONFIG } from "../lib/pricing"
import { calculateLetteringStitches, FONTS } from "../lib/lettering"
import { COPY } from "../lib/copy"
import type {
  ArchMode,
  ArtworkConfig,
  Breakdown,
  EmbroideryDesign,
  LetteringConfig,
  PricingConfig,
} from "../lib/types"
import LetteringCanvas from "./lettering-canvas"
import PriceTable from "./price-table"

type Tab = "lettering" | "artwork"

type Props = {
  quantity: number
  /** Provide a custom price level array (e.g. when level is set server-side from the customer). */
  priceLevels?: PricingConfig[]
  initialDesign?: EmbroideryDesign | null
  onDesignChange?: (design: EmbroideryDesign | null) => void
}

const DEFAULT_LETTERING: LetteringConfig = {
  text: "",
  font: "block",
  heightMm: 25,
  archMode: "straight",
}

const StitchEstimator: React.FC<Props> = ({
  quantity,
  priceLevels = PRICE_LEVELS,
  initialDesign = null,
  onDesignChange,
}) => {
  const [tab, setTab] = useState<Tab>(initialDesign?.type === "artwork" ? "artwork" : "lettering")
  const [config, setConfig] = useState<PricingConfig>(
    initialDesign?.pricing.level ?? priceLevels[0] ?? RETAIL_CONFIG
  )
  const [includeDigitizing, setIncludeDigitizing] = useState(true)
  const [consolidated, setConsolidated] = useState(false)

  const [lettering, setLettering] = useState<LetteringConfig>(
    initialDesign?.lettering ?? DEFAULT_LETTERING
  )
  const [artwork, setArtwork] = useState<ArtworkConfig>(
    initialDesign?.artwork ?? { manualStitchCount: 8000 }
  )

  const stitchCount = useMemo(() => {
    if (tab === "lettering") return calculateLetteringStitches(lettering)
    return Math.max(0, Math.round(artwork.manualStitchCount ?? 0))
  }, [tab, lettering, artwork])

  const breakdown: Breakdown = useMemo(
    () =>
      calculatePrice({
        config,
        stitchCount,
        quantity,
        consolidatedQuantity: consolidated,
        includeDigitizing,
      }),
    [config, stitchCount, quantity, consolidated, includeDigitizing]
  )

  useEffect(() => {
    if (!onDesignChange) return
    if (stitchCount <= 0) {
      onDesignChange(null)
      return
    }
    const design: EmbroideryDesign = {
      type: tab,
      stitchCount,
      lettering: tab === "lettering" ? lettering : undefined,
      artwork: tab === "artwork" ? artwork : undefined,
      pricing: breakdown,
    }
    onDesignChange(design)
  }, [tab, stitchCount, lettering, artwork, breakdown, onDesignChange])

  const tierIndex = config.quantityTiers.findIndex(
    (tier) => tier.label === breakdown.appliedTier.label
  )
  const flatTiers = config.stitchTiers.filter((tier) => !tier.isIncrementalRow)
  const rowIndex = (() => {
    const idx = flatTiers.findIndex(
      (tier) => tier.maxStitches !== null && stitchCount <= tier.maxStitches
    )
    return idx === -1 ? config.stitchTiers.length - 1 : idx
  })()

  return (
    <div className="flex flex-col gap-y-6 rounded-lg border border-ui-border-base bg-ui-bg-base p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ui-fg-base">Embroidery estimator</h3>
          <p className="text-sm text-ui-fg-subtle">
            Build your design or supply artwork — we'll estimate the stitch count and price.
          </p>
        </div>
        {priceLevels.length > 1 && (
          <select
            value={config.id}
            onChange={(e) => {
              const next = priceLevels.find((lvl) => lvl.id === e.target.value)
              if (next) {
                setConfig(next)
                setIncludeDigitizing(next.digitizingFee > 0)
              }
            }}
            className="rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 text-sm"
          >
            {priceLevels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex border-b border-ui-border-base text-sm">
        {(["lettering", "artwork"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 ${
              tab === t
                ? "border-[var(--brand-primary,#002a5c)] text-ui-fg-base"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            {t === "lettering" ? "Lettering" : "Artwork"}
          </button>
        ))}
      </div>

      {tab === "lettering" ? (
        <div className="flex flex-col gap-4">
          <LetteringCanvas
            text={lettering.text}
            font={lettering.font}
            archMode={lettering.archMode}
            heightMm={lettering.heightMm}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ui-fg-subtle">Text</span>
              <input
                type="text"
                value={lettering.text}
                onChange={(e) => setLettering({ ...lettering, text: e.target.value })}
                maxLength={40}
                className="rounded-md border border-ui-border-base px-3 py-2"
                placeholder="Your text"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ui-fg-subtle">Font</span>
              <select
                value={lettering.font}
                onChange={(e) => setLettering({ ...lettering, font: e.target.value })}
                className="rounded-md border border-ui-border-base px-3 py-2"
                title={COPY.fontPreview}
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ui-fg-subtle">
                Letter height: {lettering.heightMm}mm
              </span>
              <input
                type="range"
                min={8}
                max={50}
                value={lettering.heightMm}
                onChange={(e) =>
                  setLettering({ ...lettering, heightMm: Number(e.target.value) })
                }
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ui-fg-subtle">Layout</span>
              <select
                value={lettering.archMode}
                onChange={(e) =>
                  setLettering({ ...lettering, archMode: e.target.value as ArchMode })
                }
                className="rounded-md border border-ui-border-base px-3 py-2"
              >
                <option value="straight">Straight</option>
                <option value="arch_up">Arch up</option>
                <option value="arch_down">Arch down</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-ui-fg-muted">{COPY.fontPreview}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-dashed border-ui-border-base p-4 text-sm text-ui-fg-subtle">
            <p className="mb-2">
              For Phase 1, enter the stitch count from your artwork supplier or our digitizing
              team. AI-assisted artwork analysis is coming next.
            </p>
            <label className="flex items-center gap-3">
              <span className="w-28 text-ui-fg-base">Stitch count</span>
              <input
                type="number"
                min={0}
                step={500}
                value={artwork.manualStitchCount ?? 0}
                onChange={(e) =>
                  setArtwork({ ...artwork, manualStitchCount: Number(e.target.value) })
                }
                className="w-32 rounded-md border border-ui-border-base px-3 py-2"
              />
            </label>
          </div>
          <p className="text-xs text-ui-fg-muted">{COPY.resolutionNote}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDigitizing}
            onChange={(e) => setIncludeDigitizing(e.target.checked)}
            disabled={config.digitizingFee === 0}
          />
          <span>
            Include digitizing fee
            {config.digitizingFee > 0 && (
              <span className="text-ui-fg-subtle"> (${config.digitizingFee.toFixed(2)})</span>
            )}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm" title={COPY.consolidatedHelp}>
          <input
            type="checkbox"
            checked={consolidated}
            onChange={(e) => setConsolidated(e.target.checked)}
          />
          <span>Consolidate quantity across placements</span>
        </label>
      </div>

      {breakdown.belowMinimum && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {COPY.belowMinimum(config.minimumQuantity)}
        </div>
      )}

      <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Stitches" value={stitchCount.toLocaleString()} />
          <Stat label="Quantity tier" value={breakdown.appliedTier.label} />
          <Stat
            label="Per garment"
            value={`$${breakdown.unitDecorationPrice.toFixed(2)}`}
          />
          <Stat label="Total" value={`$${breakdown.total.toFixed(2)}`} bold />
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-ui-fg-subtle hover:text-ui-fg-base">
          See full price table
        </summary>
        <div className="mt-3">
          <PriceTable
            config={config}
            highlightTierIndex={tierIndex >= 0 ? tierIndex : undefined}
            highlightRowIndex={rowIndex}
          />
        </div>
      </details>

      <p className="text-xs text-ui-fg-muted">{COPY.finalEstimate}</p>
    </div>
  )
}

const Stat: React.FC<{ label: string; value: string; bold?: boolean }> = ({
  label,
  value,
  bold,
}) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-ui-fg-muted">{label}</div>
    <div className={`mt-0.5 ${bold ? "text-base font-semibold" : "text-sm"} text-ui-fg-base`}>
      {value}
    </div>
  </div>
)

export default StitchEstimator

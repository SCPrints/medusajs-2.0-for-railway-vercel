"use client"

import React, { useState } from "react"
import type { GarmentSide, ScreenConfig } from "@modules/customizer/lib/types"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MIN_QUANTITY,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
  screenUnitMajor,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import {
  quantisePreviewFromDataUrl,
  type ScreenColourEstimate,
} from "@modules/customizer/lib/estimate-screen-colours"

type Props = {
  side: GarmentSide
  value: ScreenConfig | undefined
  onChange: (side: GarmentSide, next: ScreenConfig) => void
  /** Current total quantity — used for the live unit-price hint. */
  totalQuantity: number
  /** Product-level heavy-garment flag (hoodies/fleece/poly, +$1/print). */
  heavyGarment?: boolean
  /** Deterministic artwork colour estimate for this side (null = no artwork yet). */
  estimate?: ScreenColourEstimate | null
  /** Resolver for the side's composed artwork — AI estimate + preview. */
  getArtworkDataUrl?: () => { dataUrl: string; mediaType: string } | null
}

/**
 * Per-side screen-print configuration. FULLY CONTROLLED from `value` — the
 * template updates the config asynchronously (artwork colour detection), so
 * unlike EmbroiderySideConfig this component keeps no local copy of the
 * pricing inputs. Local state is only for the AI/preview request lifecycle.
 */
const ScreenSideConfig: React.FC<Props> = ({
  side,
  value,
  onChange,
  totalQuantity,
  heavyGarment,
  estimate,
  getArtworkDataUrl,
}) => {
  const colours = Math.max(1, Math.min(SCREEN_MAX_COLOURS, value?.colours ?? 1))
  const darkGarment = value?.darkGarment === true
  const detected = value?.detectedColours ?? null
  const mismatch = detected !== null && detected > colours
  const mismatchConfirmed = value?.mismatchConfirmed === true

  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiNotes, setAiNotes] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<{ url: string; palette: string[]; colours: number } | null>(null)

  const commit = (overrides: Partial<ScreenConfig>) => {
    onChange(side, {
      side,
      colours,
      darkGarment,
      ...(value ?? {}),
      ...overrides,
    })
  }

  const { unitMajor, effectiveColours } = screenUnitMajor({
    quantity: totalQuantity,
    colours,
    darkGarment,
    heavyGarment,
  })
  const screens = effectiveColours
  const belowMin = totalQuantity < SCREEN_MIN_QUANTITY
  const maxSelectable = darkGarment ? SCREEN_MAX_COLOURS - 1 : SCREEN_MAX_COLOURS

  const runAiEstimate = async () => {
    const artwork = getArtworkDataUrl?.() ?? null
    if (!artwork) {
      setAiError("Add your artwork to this side first, then analyse it.")
      return
    }
    setAiBusy(true)
    setAiError(null)
    try {
      const res = await fetch("/api/screen/estimate-colours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: artwork.dataUrl, mediaType: artwork.mediaType }),
      })
      const json = (await res.json()) as {
        spotColours?: number
        screenPrintable?: boolean
        notes?: string
        message?: string
      }
      if (!res.ok) throw new Error(json?.message ?? "Colour analysis failed.")
      const spot = Math.max(1, Math.min(SCREEN_MAX_COLOURS, Math.round(json.spotColours ?? 1)))
      setAiNotes(json.notes ?? null)
      commit({
        colours: spot,
        coloursAuto: false,
        detectedColours: spot,
        mismatchConfirmed: false,
      })
    } catch (err: any) {
      setAiError(err?.message ?? "Colour analysis failed — pick the count manually.")
    } finally {
      setAiBusy(false)
    }
  }

  const runPreview = async () => {
    const artwork = getArtworkDataUrl?.() ?? null
    if (!artwork) {
      setAiError("Add your artwork to this side first.")
      return
    }
    setPreviewBusy(true)
    try {
      const result = await quantisePreviewFromDataUrl(artwork.dataUrl, colours)
      if (result) setPreview({ url: result.previewUrl, palette: result.palette, colours })
    } finally {
      setPreviewBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ui-fg-subtle">
          Ink colours in your design (max {maxSelectable}
          {darkGarment ? " — dark garment uses 1 slot for the white underbase" : ""})
        </span>
        <select
          value={Math.min(colours, maxSelectable)}
          onChange={(e) =>
            commit({
              colours: Number(e.target.value),
              coloursAuto: false,
              mismatchConfirmed: false,
            })
          }
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2"
        >
          {Array.from({ length: maxSelectable }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} colour{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>

      {estimate && detected !== null ? (
        <div className="flex items-center gap-2 text-xs text-ui-fg-subtle">
          <span>
            Artwork looks like ~{detected} colour{detected > 1 ? "s" : ""}
          </span>
          {estimate.palette.slice(0, detected).map((hex) => (
            <span
              key={hex}
              className="inline-block h-3 w-3 rounded-full border border-ui-border-base"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      ) : null}

      {estimate && !estimate.printable ? (
        <div className="rounded-md bg-ui-bg-base px-2.5 py-1.5 text-xs text-ui-fg-error">
          This artwork has gradients or too many colours for spot-colour screen
          printing — <span className="font-medium">Print (DTF)</span> will reproduce it
          exactly. Continue with screen only if you want it simplified to solid inks.
        </div>
      ) : null}

      {mismatch ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <span>
            Your artwork looks like <b>~{detected} colours</b> but{" "}
            <b>{colours}</b> {colours > 1 ? "are" : "is"} selected. Parts of your
            design will be merged or dropped when printed with fewer screens.
          </span>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={mismatchConfirmed}
              onChange={(e) => commit({ mismatchConfirmed: e.target.checked })}
            />
            Print it in {colours} colour{colours > 1 ? "s" : ""} anyway — I understand
          </label>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={darkGarment}
          onChange={(e) => {
            const next = e.target.checked
            const clamped = Math.min(colours, next ? SCREEN_MAX_COLOURS - 1 : SCREEN_MAX_COLOURS)
            commit({ darkGarment: next, colours: clamped })
          }}
        />
        <span>Dark garment (needs a white underbase screen)</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runAiEstimate()}
          disabled={aiBusy}
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-2.5 py-1.5 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle disabled:opacity-50"
        >
          {aiBusy ? "Analysing…" : "Not sure? Analyse colours with AI"}
        </button>
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={previewBusy}
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-2.5 py-1.5 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle disabled:opacity-50"
        >
          {previewBusy ? "Rendering…" : `Preview screen result (${colours} colour${colours > 1 ? "s" : ""})`}
        </button>
      </div>
      {aiError ? <div className="text-xs text-ui-fg-error">{aiError}</div> : null}
      {aiNotes ? <div className="text-xs text-ui-fg-subtle">AI: {aiNotes}</div> : null}

      {preview ? (
        <div className="flex flex-col gap-1 rounded-md border border-ui-border-base bg-ui-bg-base p-2">
          <span className="text-[11px] text-ui-fg-subtle">
            Screen-printed in {preview.colours} colour{preview.colours > 1 ? "s" : ""} your
            artwork will look like:
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={`Screen print preview, ${preview.colours} colours`}
            className="max-h-48 w-auto self-start rounded border border-ui-border-base bg-white"
          />
          <span className="flex items-center gap-1.5 text-[11px] text-ui-fg-subtle">
            Inks:
            {preview.palette.map((hex) => (
              <span
                key={hex}
                className="inline-block h-3 w-3 rounded-full border border-ui-border-base"
                style={{ backgroundColor: hex }}
              />
            ))}
          </span>
        </div>
      ) : null}

      <div className="text-xs text-ui-fg-subtle">
        ${unitMajor.toFixed(2)} per print at this quantity · {screens} screen
        {screens > 1 ? "s" : ""} × ${SCREEN_SETUP_PER_SCREEN_MAJOR} setup added at checkout
        {heavyGarment ? " · incl. $1.00 heavy-garment surcharge" : ""}
      </div>
      {belowMin ? (
        <div className="text-xs font-medium text-ui-fg-error">
          Screen printing needs at least {SCREEN_MIN_QUANTITY} pieces — increase the quantity
          or switch this side to Print (DTF).
        </div>
      ) : null}
    </div>
  )
}

export default ScreenSideConfig

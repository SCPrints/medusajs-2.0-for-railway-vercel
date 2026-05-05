"use client"

import { createContext, useContext, useMemo, useState } from "react"
import {
  DEFAULT_SCP_PRINT_SIZE_ID,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"

export type PrintPlacementSide =
  | "front"
  | "back"
  | "left_sleeve"
  | "right_sleeve"
  | "printed_tag"

export type PrintPlacement = {
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
  side: PrintPlacementSide
}

export type PdpPrintLocationSelection = {
  id: string
  side: PrintPlacementSide
  printSizeId: ScpPrintSizeId
  placement: PrintPlacement
}

type PrintPlacementContextValue = {
  overlayUrl: string | null
  overlayFileName: string | null
  selections: PdpPrintLocationSelection[]
  activeSelectionId: string | null
  activeSelection: PdpPrintLocationSelection | null
  placement: PrintPlacement
  setOverlayPreview: (next: { url: string; fileName: string } | null) => void
  setPlacement: (next: PrintPlacement) => void
  upsertSelectionForSide: (side: PrintPlacementSide, printSizeId?: ScpPrintSizeId) => void
  removeSelectionsForSide: (side: PrintPlacementSide) => void
  setActiveSelectionId: (id: string | null) => void
  setSelectionPrintSize: (id: string, printSizeId: ScpPrintSizeId) => void
  updateSelectionPlacement: (id: string, placement: PrintPlacement) => void
  resetPlacement: () => void
}

const SIZE_PRESET: Record<ScpPrintSizeId, { widthPct: number; heightPct: number }> = {
  up_to_a6: { widthPct: 20, heightPct: 18 },
  up_to_a4: { widthPct: 30, heightPct: 28 },
  up_to_a3: { widthPct: 44, heightPct: 36 },
  oversize: { widthPct: 58, heightPct: 42 },
}

const SIDE_ANCHOR: Record<PrintPlacementSide, { xPct: number; yPct: number }> = {
  front: { xPct: 28, yPct: 16 },
  back: { xPct: 28, yPct: 16 },
  left_sleeve: { xPct: 14, yPct: 22 },
  right_sleeve: { xPct: 72, yPct: 22 },
  printed_tag: { xPct: 40, yPct: 8 },
}

export const buildPlacementForSideAndSize = (
  side: PrintPlacementSide,
  printSizeId: ScpPrintSizeId
): PrintPlacement => {
  const size = SIZE_PRESET[printSizeId] ?? SIZE_PRESET.up_to_a6
  const anchor = SIDE_ANCHOR[side] ?? SIDE_ANCHOR.front
  return {
    side,
    xPct: anchor.xPct,
    yPct: anchor.yPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
  }
}

const DEFAULT_PLACEMENT: PrintPlacement = {
  xPct: 28,
  yPct: 16,
  widthPct: 30,
  heightPct: 28,
  side: "front",
}

const PrintPlacementContext = createContext<PrintPlacementContextValue | null>(
  null
)

export const PrintPlacementProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [overlayFileName, setOverlayFileName] = useState<string | null>(null)
  const [selections, setSelections] = useState<PdpPrintLocationSelection[]>([
    {
      id: "sel_front",
      side: "front",
      printSizeId: DEFAULT_SCP_PRINT_SIZE_ID,
      placement: buildPlacementForSideAndSize("front", DEFAULT_SCP_PRINT_SIZE_ID),
    },
  ])
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>("sel_front")

  const activeSelection =
    (activeSelectionId
      ? selections.find((selection) => selection.id === activeSelectionId)
      : null) ?? selections[0] ?? null
  const placement = activeSelection?.placement ?? DEFAULT_PLACEMENT

  const value = useMemo<PrintPlacementContextValue>(
    () => ({
      overlayUrl,
      overlayFileName,
      selections,
      activeSelectionId,
      activeSelection,
      placement,
      setOverlayPreview: (next) => {
        setOverlayUrl(next?.url ?? null)
        setOverlayFileName(next?.fileName ?? null)
      },
      setPlacement: (next) => {
        setSelections((prev) =>
          prev.map((selection) =>
            selection.id === (activeSelection?.id ?? "")
              ? { ...selection, placement: { ...next, side: selection.side } }
              : selection
          )
        )
      },
      upsertSelectionForSide: (side, printSizeId = DEFAULT_SCP_PRINT_SIZE_ID) => {
        setSelections((prev) => {
          const existing = prev.find((selection) => selection.side === side)
          if (existing) {
            setActiveSelectionId(existing.id)
            return prev.map((selection) =>
              selection.id === existing.id
                ? {
                    ...selection,
                    printSizeId,
                    placement: buildPlacementForSideAndSize(side, printSizeId),
                  }
                : selection
            )
          }
          const id = `sel_${side}_${Date.now()}`
          setActiveSelectionId(id)
          return [
            ...prev,
            {
              id,
              side,
              printSizeId,
              placement: buildPlacementForSideAndSize(side, printSizeId),
            },
          ]
        })
      },
      removeSelectionsForSide: (side) => {
        setSelections((prev) => {
          const next = prev.filter((selection) => selection.side !== side)
          if (next.length && !next.some((selection) => selection.id === activeSelectionId)) {
            setActiveSelectionId(next[0]?.id ?? null)
          }
          return next.length ? next : prev
        })
      },
      setActiveSelectionId,
      setSelectionPrintSize: (id, printSizeId) => {
        setSelections((prev) =>
          prev.map((selection) =>
            selection.id === id
              ? {
                  ...selection,
                  printSizeId,
                  placement: buildPlacementForSideAndSize(selection.side, printSizeId),
                }
              : selection
          )
        )
      },
      updateSelectionPlacement: (id, nextPlacement) => {
        setSelections((prev) =>
          prev.map((selection) =>
            selection.id === id
              ? { ...selection, placement: { ...nextPlacement, side: selection.side } }
              : selection
          )
        )
      },
      resetPlacement: () => {
        setSelections((prev) =>
          prev.map((selection) => ({
            ...selection,
            placement: buildPlacementForSideAndSize(selection.side, selection.printSizeId),
          }))
        )
      },
    }),
    [overlayUrl, overlayFileName, selections, activeSelectionId, activeSelection, placement]
  )

  return (
    <PrintPlacementContext.Provider value={value}>
      {children}
    </PrintPlacementContext.Provider>
  )
}

export const usePrintPlacement = () => {
  const context = useContext(PrintPlacementContext)

  if (!context) {
    throw new Error(
      "usePrintPlacement must be used within PrintPlacementProvider"
    )
  }

  return context
}

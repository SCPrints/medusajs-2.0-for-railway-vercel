"use client"

import { createContext, useContext, useMemo, useState } from "react"

export type PrintPlacement = {
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
  side: "front"
}

type PrintPlacementContextValue = {
  overlayUrl: string | null
  overlayFileName: string | null
  placement: PrintPlacement
  setOverlayPreview: (next: { url: string; fileName: string } | null) => void
  setPlacement: (next: PrintPlacement) => void
  resetPlacement: () => void
}

const DEFAULT_PLACEMENT: PrintPlacement = {
  xPct: 25,
  yPct: 15,
  widthPct: 50,
  heightPct: 50,
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
  const [placement, setPlacement] = useState<PrintPlacement>(DEFAULT_PLACEMENT)

  const value = useMemo<PrintPlacementContextValue>(
    () => ({
      overlayUrl,
      overlayFileName,
      placement,
      setOverlayPreview: (next) => {
        setOverlayUrl(next?.url ?? null)
        setOverlayFileName(next?.fileName ?? null)
      },
      setPlacement,
      resetPlacement: () => setPlacement(DEFAULT_PLACEMENT),
    }),
    [overlayUrl, overlayFileName, placement]
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

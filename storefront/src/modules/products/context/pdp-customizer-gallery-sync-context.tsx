"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

/** Same sides as the customizer; kept local to avoid pulling customizer into server code. */
export type PdpGalleryPrintSide = "front" | "back" | "left_sleeve" | "right_sleeve"

export type PdpCustomizerGallerySyncState = {
  printSide: PdpGalleryPrintSide
  /** Same URL as the customizer canvas (`getGarmentImageUrlForPrintSide`). */
  activeGarmentImageUrl: string | null
}

type Ctx = {
  sync: PdpCustomizerGallerySyncState | null
  setSync: (next: PdpCustomizerGallerySyncState | null) => void
}

const PdpCustomizerGallerySyncContext = createContext<Ctx | null>(null)

export function PdpCustomizerGallerySyncProvider({ children }: { children: ReactNode }) {
  const [sync, setSync] = useState<PdpCustomizerGallerySyncState | null>(null)
  const value = useMemo(() => ({ sync, setSync }), [sync])
  return (
    <PdpCustomizerGallerySyncContext.Provider value={value}>{children}</PdpCustomizerGallerySyncContext.Provider>
  )
}

export function usePdpCustomizerGallerySync() {
  return useContext(PdpCustomizerGallerySyncContext)
}

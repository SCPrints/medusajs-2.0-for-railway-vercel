"use client"

import { RenderPlacement } from "@modules/customizer/lib/types"
import { RefObject } from "react"

type CanvasStageProps = {
  garmentImage: string | null
  garmentTitle: string | null
  /** When true, no product photo behind the print area (avoids duplicating the PDP gallery). */
  omitBackgroundImage?: boolean
  /** Included in the image key so front/back swaps remount even if URLs match. */
  printSideKey?: string
  printArea: RenderPlacement
  showPrintAreaGuides?: boolean
  outOfBoundsWarning: string | null
  dpiWarning: string | null
  /** Empty mount node; parent creates the canvas imperatively so Fabric can wrap the canvas without breaking React’s sibling tree. */
  fabricContainerRef: RefObject<HTMLDivElement | null>
}

export default function CanvasStage({
  garmentImage,
  garmentTitle,
  omitBackgroundImage = false,
  printSideKey = "front",
  printArea,
  showPrintAreaGuides = false,
  outOfBoundsWarning,
  dpiWarning,
  fabricContainerRef,
}: CanvasStageProps) {
  const showPhoto = !omitBackgroundImage && garmentImage

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
      {showPhoto ? (
        // Native <img>: garment URLs come from variant metadata / many CDNs and may not match
        // next/image remotePatterns; using next/image here caused render errors caught by PDP boundary.
        <img
          key={`${printSideKey}-${garmentImage}`}
          src={garmentImage!}
          alt={garmentTitle ?? "Garment"}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : omitBackgroundImage ? (
        <div
          className="absolute inset-0 bg-ui-bg-subtle bg-[linear-gradient(45deg,transparent_46%,rgb(0_0_0/0.06)_49%,rgb(0_0_0/0.06)_51%,transparent_55%)] bg-[length:12px_12px]"
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-ui-fg-subtle">
          No garment image available. You can still design and export artwork.
        </div>
      )}

      {showPrintAreaGuides ? (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-sky-500"
          style={{
            left: printArea.x,
            top: printArea.y,
            width: printArea.width,
            height: printArea.height,
          }}
          aria-hidden
        />
      ) : null}

      <div
        ref={fabricContainerRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-hidden
      />

      {(outOfBoundsWarning || dpiWarning) && (
        <div className="absolute bottom-3 left-3 right-3 space-y-1 rounded-md bg-ui-bg-base/90 p-2 text-xs shadow">
          {outOfBoundsWarning && <p className="text-rose-600">{outOfBoundsWarning}</p>}
          {dpiWarning && <p className="text-amber-700">{dpiWarning}</p>}
        </div>
      )}
    </div>
  )
}

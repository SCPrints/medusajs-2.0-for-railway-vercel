"use client"

import Image from "next/image"
import { RenderPlacement } from "@modules/customizer/lib/types"
import { RefObject } from "react"

type CanvasStageProps = {
  garmentImage: string | null
  garmentTitle: string | null
  printArea: RenderPlacement
  outOfBoundsWarning: string | null
  dpiWarning: string | null
  canvasRef: RefObject<HTMLCanvasElement | null>
}

export default function CanvasStage({
  garmentImage,
  garmentTitle,
  printArea,
  outOfBoundsWarning,
  dpiWarning,
  canvasRef,
}: CanvasStageProps) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
      {garmentImage ? (
        <Image
          src={garmentImage}
          alt={garmentTitle ?? "Garment"}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 720px"
          priority
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-ui-fg-subtle">
          No garment image available. You can still design and export artwork.
        </div>
      )}

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

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {(outOfBoundsWarning || dpiWarning) && (
        <div className="absolute bottom-3 left-3 right-3 space-y-1 rounded-md bg-ui-bg-base/90 p-2 text-xs shadow">
          {outOfBoundsWarning && <p className="text-rose-600">{outOfBoundsWarning}</p>}
          {dpiWarning && <p className="text-amber-700">{dpiWarning}</p>}
        </div>
      )}
    </div>
  )
}

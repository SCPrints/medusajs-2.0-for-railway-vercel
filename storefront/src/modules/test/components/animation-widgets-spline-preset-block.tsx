"use client"

import Spline from "@splinetool/react-spline"
import type { Application } from "@splinetool/runtime"
import { useCallback } from "react"

import type { SplineLabPreset } from "@modules/test/animation-lab-spline-presets"
import { splineSceneUrlForIndex } from "@modules/test/animation-lab-spline-presets"

type Props = {
  preset: SplineLabPreset
  reducedMotion: boolean
}

export default function AnimationWidgetsSplinePresetBlock({ preset, reducedMotion }: Props) {
  const scene = splineSceneUrlForIndex(preset.envIndex)

  const onLoad = useCallback(
    (app: Application) => {
      if (!reducedMotion) {
        return
      }
      try {
        app.stop?.()
      } catch {
        /* defensive */
      }
    },
    [reducedMotion, preset.id]
  )

  if (!scene) {
    return (
      <div className="flex h-[260px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle p-6 text-center">
        <p className="text-sm text-ui-fg-muted">
          No scene URL for slot <strong>{preset.envIndex}</strong>.
        </p>
        <p className="max-w-md text-xs text-ui-fg-muted">
          In Spline: <strong>Export → Public URL</strong>. Add to <code className="text-ui-fg-base">.env.local</code>:{" "}
          <code className="text-ui-fg-base">NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_{preset.envIndex}=…</code>
        </p>
      </div>
    )
  }

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-xl border border-ui-border-base bg-black">
      <Spline scene={scene} onLoad={onLoad} className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full" />
    </div>
  )
}
